import { config } from "dotenv";
config()
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings,ChatOpenAI } from "@langchain/openai";
import { GithubRepoLoader} from "@langchain/community/document_loaders/web/github";
import { Octokit } from "@octokit/rest";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
    RunnablePassthrough,
    RunnableSequence,
  } from "@langchain/core/runnables";
  import { StringOutputParser } from "@langchain/core/output_parsers";
  
import readline from 'readline';
import { ChromaClient } from 'chromadb';

const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-3-small",
});
const model = new ChatOpenAI({ model: "gpt-4" });

const octokit = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN });

const vectorStore = new Chroma(embeddings, {
  collectionName: "github_data_collection",
  url: "http://localhost:8000", // Optional, will default to this value
  collectionMetadata: {
    "hnsw:space": "cosine",
  }, // Optional, can be used to specify the distance method of the embedding space https://docs.trychroma.com/usage-guide#changing-the-distance-function
});

async function fetchGithubData(username) {
  const userData = await octokit.users.getByUsername({ username });
  const repos = await octokit.repos.listForUser({ username, per_page: 100 }); // Increase if user has more than 100 repos

  const githubData = {
    basicDetails: {
      name: userData.data.name,
      login: userData.data.login,
      bio: userData.data.bio,
      followers: userData.data.followers,
      following: userData.data.following,
      public_repos: userData.data.public_repos,
      html_url: userData.data.html_url,
      created_at: userData.data.created_at,
      updated_at: userData.data.updated_at,
    },
    languages: new Set(),
    techStack: new Set(),
    repos: [],
  };

  for (const repo of repos.data) {
    const [repoLanguages, readme, contributors] = await Promise.all([
      octokit.repos.listLanguages({ owner: username, repo: repo.name }),
      fetchReadme(username, repo.name),
      octokit.repos.listContributors({ owner: username, repo: repo.name })
    ]);

    const repoData = {
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      readme: readme,
      languages: Object.keys(repoLanguages.data),
      language: repo.language, // Primary language
      created_at: repo.created_at,
      updated_at: repo.updated_at,
      pushed_at: repo.pushed_at,
      stargazers_count: repo.stargazers_count,
      watchers_count: repo.watchers_count,
      forks_count: repo.forks_count,
      open_issues_count: repo.open_issues_count,
      license: repo.license,
      topics: repo.topics || [],
      fork: repo.fork,
      default_branch: repo.default_branch,
      size: repo.size,
      contributors: contributors.data.map(c => c.login),
    };

    githubData.repos.push(repoData);
    repoData.languages.forEach(lang => githubData.languages.add(lang));
  }

  githubData.languages = Array.from(githubData.languages);
  console.log(githubData)
  return githubData;
}

async function fetchReadme(owner, repo) {
  try {
    const readmeResponse = await octokit.repos.getReadme({ owner, repo });
    return Buffer.from(readmeResponse.data.content, 'base64').toString();
  } catch (error) {
    if (error.status === 404) {
      console.log(`README not found for ${repo}`);
    } else {
      console.error(`Error fetching README for ${repo}:`, error);
    }
    return null;
  }
}
  
async function chunkDocument(doc) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 0,
    });
  
    const chunks = await splitter.splitDocuments([doc]);
    return chunks.map((chunk, index) => ({
      ...chunk,
      metadata: {
        ...chunk.metadata,
        chunk_index: index,
        total_chunks: chunks.length,
      },
    }));
}
  
async function storeGithubData(githubData) {
  const documents = [];

  // Store user overview with improved metadata
  documents.push(new Document({
    pageContent: JSON.stringify({
      type: "user_overview",
      name: githubData.basicDetails.name,
      login: githubData.basicDetails.login,
      bio: githubData.basicDetails.bio,
      url: githubData.basicDetails.html_url,
      publicRepos: githubData.basicDetails.public_repos,
      followers: githubData.basicDetails.followers,
      following: githubData.basicDetails.following,
      allLanguages: Array.from(githubData.languages),
      totalStars: githubData.repos.reduce((sum, repo) => sum + repo.stars, 0),
      totalWatchers: githubData.repos.reduce((sum, repo) => sum + repo.watchers, 0),
    }),
    metadata: { 
      type: "user_overview",
      login: githubData.basicDetails.login,
      repoCount: githubData.basicDetails.public_repos,
      followerCount: githubData.basicDetails.followers,
      totalStars: githubData.repos.reduce((sum, repo) => sum + repo.stars, 0)
    }
  }));

  // Store each repo with improved metadata
  for (const repo of githubData.repos) {
    const repoDoc = new Document({
      pageContent: JSON.stringify({
        type: "repo",
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        languages: repo.languages,
        primaryLanguage: repo.language,
        createdAt: repo.created_at,
        lastUpdated: repo.updated_at,
        lastPushed: repo.pushed_at,
        stars: repo.stargazers_count,
        watchers: repo.watchers_count,
        forks: repo.forks_count,
        issues: repo.open_issues_count,
        license: repo.license ? repo.license.name : null,
        topics: repo.topics,
        isForked: repo.fork,
        defaultBranch: repo.default_branch,
        size: repo.size,
      }),
      metadata: { 
        type: "repo", 
        name: repo.name,
        owner: githubData.basicDetails.login,
        primaryLanguage: repo.language,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        lastUpdated: repo.updated_at,
        createdAt: repo.created_at,
        isForked: repo.fork,
        size: repo.size,
        topics: repo.topics.join(',')
      }
    });

    // Chunk the repo document if necessary
    const chunkedRepoDocs = await chunkDocument(repoDoc);
    documents.push(...chunkedRepoDocs);

    // Store readme as a separate document if available
    if (repo.readme) {
      const readmeDoc = new Document({
        pageContent: repo.readme,
        metadata: { 
          type: "readme", 
          repoName: repo.name,
          owner: githubData.basicDetails.login,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          lastUpdated: repo.updated_at,
          primaryLanguage: repo.language
        }
      });
      
      // Chunk the readme document if necessary
      const chunkedReadmeDocs = await chunkDocument(readmeDoc);
      documents.push(...chunkedReadmeDocs);
    }
  }

  if (documents.length > 0) {
    try {
      await vectorStore.addDocuments(documents);
      console.log(`Stored ${documents.length} documents (including chunks) in the vector store.`);
    } catch (error) {
      console.error("Error storing documents in vector store:", error);
      console.error("Error details:", JSON.stringify(error, null, 2));
    }
  } else {
    console.log("No valid documents to store.");
  }
}
  
async function queryVectorStore(query, k = 5) {
    try {
      const results = await vectorStore.similaritySearch(query, k);
  
      console.log(`Query: "${query}"`);
      console.log(`Top ${k} results:`);
      results.forEach((doc, index) => {
        console.log(`\nResult ${index + 1}:`);
        console.log(`Content: ${doc.pageContent}`);
        console.log(`Metadata: ${JSON.stringify(doc.metadata, null, 2)}`);
      });
  
      return results;
    } catch (error) {
      console.error("Error querying vector store:", error);
    }
  }
async function deleteChromaCollection(collectionName) {
    const client = new ChromaClient();
    
    try {
      await client.deleteCollection({ name: collectionName });
      console.log(`Collection ${collectionName} has been deleted.`);
    } catch (error) {
      console.error(`Error deleting collection ${collectionName}:`, error);
    }
  }
  
  async function queryGithubData(options = {}) {
    const {
      query = "",
      type = null,
      repoName = null,
      language = null,
      minStars = null,
      maxStars = null,
      dateRange = null,
      topic = null,
      limit = 2
    } = options;
  
    // Construct metadata filter
    const metadataFilter = {};
    if (type) metadataFilter.type = type;
    if (repoName) metadataFilter.repoName = repoName;
    if (minStars) metadataFilter.stars = { $gte: minStars };
    if (maxStars) metadataFilter.stars = { ...metadataFilter.stars, $lte: maxStars };
    if (language) metadataFilter.primaryLanguage = language;
    if (dateRange) {
      metadataFilter.lastUpdated = {
        $gte: dateRange.start,
        $lte: dateRange.end
      };
    }
    if (topic) metadataFilter.topics = { $contains: topic };
  
    console.log('Metadata filter:', metadataFilter);
  
    // Perform vector similarity search with metadata filtering
    const results = await vectorStore.similaritySearchWithScore(
      query,
      limit,
      metadataFilter
    );
  
    // console.log('Results:', results);
    const highestScoreResult = results.reduce((highest, current) => {
      return current[1] > highest[1] ? current : highest;
    });
  

    if (highestScoreResult) {
      const [doc, score] = highestScoreResult;
      return {
        type: doc.metadata.type,
        content: doc.pageContent,
        metadata: doc.metadata,
        similarity: score
      };
    } else {
      return null;  // Return null if no results found
    }
  
  
  }
  async function queryRustProjects() {
    const rustProjects = await queryGithubData({
      query: "PoW",
      language: 'Rust',
      limit: 5
    });
  
    // console.log(`Found ${rustProjects.length} Rust projects:`);
    console.log(rustProjects)
    // rustProjects.forEach(result => {
    //   console.log(`Repository: ${result.metadata.name}`);
    //   console.log(`Type: ${result.type}`);
    //   console.log(`Content preview: ${result.content.substring(0, 100)}...`);
    //   console.log(`Stars: ${result.metadata.stars}`);
    //   console.log('---');
    
    // });
  
    return rustProjects;
  }
  
  import { promises as fs } from 'fs';

  async function saveAllDocsToJson(filename = 'all_docs.json') {
    try {
      console.log("Fetching all documents from the vector store...");
      const allDocs = await vectorStore.similaritySearch(
        "", // Empty query to fetch all documents
        1000, // Adjust this number based on your expected maximum number of documents
        {} // No filters
      );
  
      console.log(`Total documents fetched: ${allDocs.length}`);
  
      // Process documents to ensure they're JSON-serializable
      const processedDocs = allDocs.map(doc => ({
        pageContent: doc.pageContent, // Keep as is, don't try to parse
        metadata: doc.metadata,
        // You might want to add additional fields here if needed
      }));
  
      console.log("Writing documents to file...");
      await fs.writeFile(filename, JSON.stringify(processedDocs, null, 2));
      console.log(`Documents successfully saved to ${filename}`);
  
    } catch (error) {
      console.error("Error saving documents to JSON:", error);
      // Log more details about the error
      if (error instanceof SyntaxError) {
        console.error("JSON Syntax Error Details:");
        console.error(error.message);
        console.error("Error occurred at position:", error.position);
        console.error("Snippet of problematic content:", error.source?.slice(Math.max(0, error.position - 20), error.position + 20));
      }
    }
  }
    
(async()=>{ 

    // const data = await fetchGithubData("aduttya")
    // await storeGithubData(data)

    // await saveAllDocsToJson();

    await queryRustProjects()
    
})()
  
