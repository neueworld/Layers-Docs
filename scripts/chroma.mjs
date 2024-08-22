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
import { PromptTemplate } from "@langchain/core/prompts";
import {_fetchGitHubData} from './github.mjs';
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
  
async function queryGithubData(queryParams) {

    const client = new ChromaClient();

    const { query, metadata, limit } = queryParams;
  
    // Construct metadata filter
    const metadataFilter = {};
    
    if (metadata.type) metadataFilter.type = metadata.type;
    if (metadata.repoName) metadataFilter.repoName = metadata.repoName;
    
    if (metadata.stars !== undefined) {
      metadataFilter.stars = { $gte: metadata.stars };
    }
    
    if (metadata.language) metadataFilter.primaryLanguage = metadata.language;
    
    if (metadata.lastUpdated) {
      metadataFilter.lastUpdated = { $gte: metadata.lastUpdated };
    }
    
    if (metadata.topics && metadata.topics.length > 0) {
      metadataFilter.topics = { $contains: metadata.topics[0] }; // Using the first topic
    }
  
    console.log('Metadata filter:', metadataFilter);
    console.log('query')

    const collection = await client.getCollection({
      name: "github_data_collection",
      embeddingFunction: embeddings,
    })
    //Verify that the Chroma collection is not empty:
    const count = await collection.count()
    console.log("Total documents:", count);

    // Perform vector similarity search with metadata filtering
    const results = await vectorStore.similaritySearchWithScore(
      query,
      limit,
      metadataFilter
    );

    console.log("result : ",results)
    if (results.length === 0) {
      return null;  // Return null if no results found
    }
  
    // Find the result with the highest similarity score
    const highestScoreResult = results.reduce((highest, current) => {
      return current[1] > highest[1] ? current : highest;
    });
  
    const [doc, score] = highestScoreResult;
    return {
      type: doc.metadata.type,
      content: doc.pageContent,
      metadata: doc.metadata,
      similarity: score
    };
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
  
const metadataValidators = {
  type: (value) => ['user_overview', 'readme', 'code','repo'].includes(value),
  repoName: (value) => typeof value === 'string',
  stars: (value) => Number.isInteger(value) && value >= 0,
  forks: (value) => Number.isInteger(value) && value >= 0,
  language: (value) => typeof value === 'string',
  lastUpdated: (value) => !isNaN(Date.parse(value)),
  topics: (value) => Array.isArray(value) && value.every(topic => typeof topic === 'string')
};

// Function to validate and sanitize the LLM output
function validateQueryParams(params) {
  const validatedParams = {
    query: typeof params.query === 'string' ? params.query : '*',
    metadata: {},
    limit: Number.isInteger(params.limit) && params.limit > 0 && params.limit <= 100 ? params.limit : 10
  };

  for (const [key, validator] of Object.entries(metadataValidators)) {
    if (params.metadata && key in params.metadata) {
      if (validator(params.metadata[key])) {
        validatedParams.metadata[key] = params.metadata[key];
      }
    }
  }

  return validatedParams;
}

// Define the structured output schema
const structuredLlm = model.withStructuredOutput({
  name: "githubQueryParams",
  description: "Parameters for querying GitHub user data",
  parameters: {
    title: "GitHub Query Parameters",
    type: "object",
    properties: {
      query: { 
        type: "string", 
        description: "The main search query string" 
      },
      metadata: {
        type: "object",
        properties: {
          type: { 
            type: "string", 
            enum: ["user_overview", "readme", "code","repo"],
            description: "Type of content to search for" 
          },
          repoName: { 
            type: "string", 
            description: "Name of the repository (if applicable)" 
          },
          stars: { 
            type: "integer", 
            minimum: 0,
            description: "Minimum number of stars (if applicable)" 
          },
          forks: { 
            type: "integer", 
            minimum: 0,
            description: "Minimum number of forks (if applicable)" 
          },
          language: { 
            type: "string", 
            description: "Primary programming language (if applicable)" 
          },
          lastUpdated: { 
            type: "string", 
            format: "date-time",
            description: "Last updated date in ISO format (if applicable)" 
          },
          topics: { 
            type: "array", 
            items: { type: "string" },
            description: "List of topics (if applicable)" 
          }
        },
        additionalProperties: false
      },
      limit: { 
        type: "integer", 
        minimum: 1,
        maximum: 100,
        description: "Number of documents to retrieve" 
      }
    },
    required: ["query", "metadata", "limit"],
  },
});

// Create a prompt template
const promptTemplate = PromptTemplate.fromTemplate(`
  Given the following user query about GitHub repositories, generate appropriate search parameters.
  
  User Query: {userQuery}
  
  Provide a structured output with these elements:
  2. metadata: Include only relevant filters. Omit fields if they're not applicable.
  3. limit: Number of documents to retrieve. Use a high number like 1000 for count queries.
  4. isMetadataOnly: Set to true for queries that don't require content similarity search.
  
  Remember, for count queries, we're interested in all matching documents, not just a subset.
  `);
  
async function getLLMQueryParams(userQuery) {
  const formattedPrompt = await promptTemplate.format({ userQuery });
  
  try {
    const rawResult = await structuredLlm.invoke(formattedPrompt, { name: "githubQueryParams" });
    let validatedResult = validateQueryParams(rawResult);
    
    return validatedResult;
  } catch (error) {
    console.error("Error getting or validating LLM query params:", error);
    throw error;
  }
}




async function oldbreakdownQuery(query) {
  const structuredLlm = model.withStructuredOutput({
    name: "queryBreakdown",
    description: "Breakdown of the user's GitHub-related query.",
    parameters: {
      type: "object",
      properties: {
        intent: { 
          type: "string", 
          description: "The main intent of the query",
          enum: ["count", "list", "describe", "compare"]
        },
        entities: { 
          type: "array", 
          items: { type: "string" },
          description: "Important entities mentioned in the query (e.g., repo names, usernames, languages)"
        },
        requiredData: { 
          type: "array", 
          items: { 
            type: "string",
            enum: ["repos", "user", "languages", "commits", "issues","events"]
          },
          description: "Types of GitHub data needed to answer the query"
        },
        additionalParams: {
          type: "object",
          description: "Additional parameters needed for the query (e.g., language for filtering)"
        }
      },
      required: ["intent", "entities", "requiredData", "additionalParams"],
    },
  });

  return await structuredLlm.invoke(query);
}

async function breakdownQuery(query) {
  const githubApiContext = `
  Available GitHub API endpoints and their data:
  1. repos: Provides information about repositories (name, description, language, stars, forks, last push date, URL)
  2. user: Provides user profile information (login, name, number of public repos, followers, following, account creation date)
  3. languages: Provides statistics about programming languages used in repositories
  4. commits: Provides information about repository commits
  5. issues: Provides information about repository issues
  6. events: Provides information about recent GitHub events (type, repository, creation date, actor)

  When determining requiredData, consider which endpoints are necessary to answer the query accurately.
  `;

  const structuredLlm = model.withStructuredOutput({
    name: "queryBreakdown",
    description: "Breakdown of the user's GitHub-related query with filter function.",
    parameters: {
      type: "object",
      properties: {
        intent: { 
          type: "string", 
          description: "The main intent of the query",
          enum: ["count", "list", "describe", "compare"]
        },
        entities: { 
          type: "array", 
          items: { type: "string" },
          description: "Important entities mentioned in the query (e.g., repo names, usernames, languages)"
        },
        requiredData: { 
          type: "array", 
          items: { 
            type: "string",
            enum: ["repos", "user", "languages", "commits", "issues", "events"]
          },
          description: "Types of GitHub data needed to answer the query"
        },
        additionalParams: {
          type: "object",
          properties: {
            language: { type: "string", description: "Programming language to filter by" },
            sortBy: { type: "string", description: "Field to sort results by" },
            limit: { type: "number", description: "Number of results to return" }
          },
          description: "Additional parameters needed for the query"
        },
        filterFunction: {
          type: "string",
          description: "A JavaScript function string that can be used to filter the data. This function should take a single argument (the data item) and return a boolean."
        }
      },
      required: ["intent", "entities", "requiredData", "additionalParams", "filterFunction"],
    },
  });

  return await structuredLlm.invoke(
    `${githubApiContext}

User query: ${query}

Provide a breakdown of the query based on the available GitHub API endpoints. Include a filterFunction that can be used to further refine the data based on the query. The filterFunction should be a JavaScript function string that takes a single argument (the data item) and returns a boolean.

Example filterFunction for "Find repositories with more than 100 stars":
"(repo) => repo.stars > 100"

Ensure the filterFunction is appropriate for the data type (repos, user, languages, etc.) and the query intent.`
  );
}




// This function will be used to filter data given by the LLMs
function filterData(data, filterFunction) {
  if (Array.isArray(data)) {
    return data.filter(filterFunction);
  } else if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).filter(([key, value]) => filterFunction(value, key))
    );
  }
  return data;
}


(async()=>{ 

  const queries = [
       "What are the top repos?",
      // "Does he has work with Python? show me the python projects",
      // "How long he has been a developer?"
    //"What are the primary programming languages this developer uses, based on their repository contributions?",
   // "How active is this developer on GitHub? Can you provide statistics on their commit frequency and consistency over the past year?",
    //"What types of projects does this developer work on most frequently? Are they mostly personal projects, open-source contributions, or professional work?",
    // "Can you identify any significant or popular open-source projects this developer has contributed to?",
    // "What is the average complexity of the code this developer writes, based on metrics like cyclomatic complexity or lines of code per function?",
    // "How well does this developer document their code? Can you provide examples of their commenting style and README files?",
  //   "Does the developer have experience with version control best practices, such as creating meaningful commit messages and using feature branches?",
  //   "Are there any particular areas of expertise or specialization evident from the developer's repositories and contributions?",
  //   "How does this developer handle error handling and testing in their projects? Can you provide examples of unit tests or error handling patterns they commonly use?",
  //   "Can you identify any patterns in the developer's problem-solving approach or coding style based on their commit history and code samples?"
    ];

  const results = [];

    for (const userQuery of queries) {
      try {
        //const queryParams = await oldbreakdownQuery(userQuery);
        console.log(`Query: ${userQuery}`);
        //console.log("LLM generated query parameters:", JSON.stringify(queryParams, null, 2));
        const newqueryParams = await breakdownQuery(userQuery);
        console.log("LLM generated query parameters (New) :", JSON.stringify(newqueryParams, null, 2));
        // results.push({ query: userQuery, params: queryParams });
        
        // Uncomment these lines when you're ready to fetch and process GitHub data
      //  const queryResult = await _fetchGitHubData(newqueryParams,"aduttya");
        // console.log(queryResult)
        
      } catch (error) {
        console.error(`Failed to process query: ${userQuery}`, error);
      }
  }

    

    // const data = await fetchGithubData("aduttya")
    // await storeGithubData(data)

    // await saveAllDocsToJson();

    // await queryRustProjects()
    
})()
  
