import { config } from "dotenv";
config()
import { Chroma } from "@langchain/community/vectorstores/chroma";
import { OpenAIEmbeddings,ChatOpenAI} from "@langchain/openai";
import { GithubRepoLoader} from "@langchain/community/document_loaders/web/github";
import { Octokit } from "@octokit/rest";
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { 
    ChatPromptTemplate,
    FewShotChatMessagePromptTemplate,
    SystemMessagePromptTemplate,
    HumanMessagePromptTemplate, } from "@langchain/core/prompts";
import {
    RunnablePassthrough,
    RunnableSequence,
  } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
    AIMessage,
    HumanMessage,
    SystemMessage,
    trimMessages,
  } from "@langchain/core/messages";
import { StructuredOutputParser } from "langchain/output_parsers";

import readline from 'readline';
import { ChromaClient } from 'chromadb';
import { PromptTemplate } from "@langchain/core/prompts";
import {_fetchGitHubData} from './github.mjs';
import {queryUserRepos} from "./mongo.mjs"


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


const githubApiContext = [
  {
    endpoint: "repos",
    description: "Basic information about repositories",
    dataFields: ["name", "description", "language", "stars", "forks", "lastPushDate", "url"],
    useCase: "General repository information",
  },
  {
    endpoint: "user",
    description: "User profile information",
    dataFields: ["login", "name", "followers", "following", "creationDate"],
    useCase: "User-specific queries",
  },
  {
    endpoint: "languages",
    description: "Statistics about programming languages used in repositories",
    dataFields: ["language", "bytesOfCode"],
    useCase: "Language analysis across repositories",
  },
  {
    endpoint: "commits",
    description: "Information about repository commits",
    dataFields: ["sha", "message", "author", "date"],
    useCase: "Commit history and patterns",
  },
  {
    endpoint: "issues",
    description: "Information about repository issues",
    dataFields: ["number", "title", "state", "creator", "creationDate"],
    useCase: "Issue tracking and analysis",
  },
  {
    endpoint: "events",
    description: "Information about recent GitHub events",
    dataFields: ["type", "repository", "creationDate", "actor"],
    useCase: "Activity tracking across repositories",
  },
  {
    endpoint: "repo tree",
    description: "File structure and contents of a repository",
    dataFields: ["path", "type", "file content"],
    useCase: "File content analysis, including README files",
  }
];
function addRandomnessToPrompt(prompt) {
  const randomString = Math.random().toString(36).substring(7);
  return `${prompt}\n\nUnique identifier: ${randomString}`;
}

async function breakdownQuery(query) {
  const structuredLlm = model.withStructuredOutput({
    name: "queryBreakdown",
    description: "Breakdown of the user's GitHub-related query with database query for filtering and sorting repositories.",
    parameters: {
      type: "object",
      properties: {
        intent: { 
          type: "string", 
          description: "The main intent of the query",
          enum: ["count", "list", "describe", "compare", "analyze"]
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
            enum: githubApiContext.map(endpoint => endpoint.endpoint)
          },
          description: "Types of GitHub data needed to answer the query, ONLY from the provided list"
        },
        dbQuery: {
          type: "object",
          description: "A query object that can be used to filter and sort the data in the database",
          properties: {
            language: { type: "string", description: "Programming language to filter by" },
            limit: { type: "number", description: "Number of repositories to return" },
            sortBy: { 
              type: "string", 
              description: "Field to sort repositories by",
              enum: ["created_at", "updated_at", "pushed_at", "stargazers_count", "forks_count"]
            },
            sortOrder: { type: "string", enum: ["asc", "desc"], description: "Order of sorting (ascending or descending)" },
            minStars: { type: "number", description: "Minimum number of stars" },
            minForks: { type: "number", description: "Minimum number of forks" },
            dateField: { 
              type: "string", 
              description: "Which date field to use for filtering",
              enum: ["created_at", "updated_at", "pushed_at"]
            },
            dateFrom: { type: "string", format: "date", description: "Start date for filtering" },
            dateTo: { type: "string", format: "date", description: "End date for filtering" },
            keyword: { type: "string", description: "Keyword to search in repo name or description" }
          }
        }
      },
      required: ["intent", "entities", "requiredData", "dbQuery"],
    },
  });
    

  const basePrompt = `GitHub API Context:
${JSON.stringify(githubApiContext, null, 2)}

User query: ${query}

IMPORTANT: Provide a breakdown of the query based ONLY on the available GitHub API endpoints listed above. Follow these strict rules:
1. Only include endpoints in requiredData that are directly relevant to answering the query.
2. If the query requires analyzing file contents or README files, ONLY include 'repo tree' in the requiredData array.
3. Do not include 'repos' or 'user' in requiredData if only file content analysis is needed.
4. Consider the useCase field of each endpoint when determining its relevance to the query.
5. Ensure that the filterFunction and contentAnalysisFunction (if needed) only reference data fields available in the selected endpoints.

Provide a breakdown of the query, including a filterFunction that can be used to refine the data based on the query, and a contentAnalysisFunction if file content analysis is required.

Remember to ONLY use the endpoints and data fields specified in the context above.`;

  const randomizedPrompt = addRandomnessToPrompt(basePrompt);

  return await structuredLlm.invoke(randomizedPrompt);
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

async function expandQuery(query, context) {
  const expandedQueryPrompt = `
    ${context}
    User query: "${query}"
    Provide a slightly expanded version of this query that clarifies the intent without adding complexity.
    The expansion should:
    1. Maintain the simplicity of the original query.
    2. Focus only on the primary intent.
    3. Avoid introducing new data sources unless absolutely necessary.
    4. Use at most one additional sentence for clarification if needed.
    Provide your response in the following JSON format:
    {
      "expandedQuery": "string"
    }
  `;
  const response = await model.invoke(expandedQueryPrompt);
  
  let parsedContent;
  try {
    parsedContent = JSON.parse(response.content);
  } catch (error) {
    console.error('Error parsing AIMessage content:', error);
    throw new Error('Failed to parse AIMessage content');
  }

  if (!parsedContent || !parsedContent.expandedQuery) {
    throw new Error('Invalid or missing expandedQuery in AIMessage content');
  }

  return parsedContent.expandedQuery;
}

// async function analyzeGitHubData(userQuery, queryResult) {

//   const prompt = ChatPromptTemplate.fromTemplate(`
//     You are a GitHub data analyst assistant. Analyze the provided GitHub data and answer the user's query.

//     User Query: {userQuery}

//     GitHub Data:
//     {githubData}

//     Please provide a detailed answer to the user's query based on the given GitHub data.
//     Focus on the aspects mentioned in the user's query.
//     If the data doesn't contain relevant information to answer the query, please state that clearly.

//     Your response:
//   `);

//   const chain = prompt.pipe(model).pipe(new StringOutputParser());

//   // Prepare GitHub data string
//   let githubDataString = JSON.stringify(queryResult, null, 2);

//   // If the data is too large, we might need to summarize or truncate it
//   if (githubDataString.length > 10000) { // Adjust this limit as needed
//     githubDataString = summarizeGitHubData(queryResult);
//   }

//   const response = await chain.invoke({
//     userQuery: userQuery,
//     githubData: githubDataString
//   });

//   return response;
// }

// async function analyzeGitHubData(userQuery, queryResult) {
//   const textSplitter = new RecursiveCharacterTextSplitter({
//     chunkSize: 4000,
//     chunkOverlap: 200,
//   });

//   // Convert queryResult to string and split into chunks
//   const githubDataString = JSON.stringify(queryResult, null, 2);
//   const chunks = await textSplitter.createDocuments([githubDataString]);

//   // Initialize the analysis prompt
//   const analysisPrompt = ChatPromptTemplate.fromTemplate(`
//     You are a GitHub data analyst assistant. Analyze the provided GitHub data chunk and answer the user's query.
//     Previous analysis: {previousAnalysis}

//     User Query: {userQuery}

//     GitHub Data Chunk:
//     {githubDataChunk}

//     Please provide an updated analysis based on this new chunk of data.
//     Focus on the aspects mentioned in the user's query.
//     If this chunk doesn't contain new relevant information, state that and maintain the previous analysis.

//     Your response:
//   `);

//   const analysisChain = analysisPrompt.pipe(model).pipe(new StringOutputParser());

//   // Initialize the summary prompt
//   const summaryPrompt = ChatPromptTemplate.fromTemplate(`
//     Summarize the following GitHub data analysis:
//     {analysis}

//     Provide a concise summary that captures the key points of the analysis.
//     Your summary:
//   `);

//   const summaryChain = summaryPrompt.pipe(model).pipe(new StringOutputParser());

//   let currentAnalysis = "No analysis yet.";
//   let chunkResponses = [];

//   // Process each chunk iteratively
//   for (let i = 0; i < chunks.length; i++) {
//     console.log(`Processing chunk ${i + 1} of ${chunks.length}`);
    
//     // This is where the LLM request is sent for each chunk
//     const chunkAnalysis = await analysisChain.invoke({
//       userQuery: userQuery,
//       githubDataChunk: chunks[i].pageContent,
//       previousAnalysis: currentAnalysis
//     });

//     // Update the current analysis
//     currentAnalysis = chunkAnalysis;

//     // Store the response for this chunk
//     chunkResponses.push({
//       chunkNumber: i + 1,
//       chunkContent: chunks[i].pageContent.substring(0, 100) + "...", // First 100 characters for brevity
//       response: chunkAnalysis
//     });

//     console.log(`Chunk ${i + 1} analysis:`);
//     console.log(chunkAnalysis);
//     console.log("--------------------");
//   }

//   // Generate a final summary
//   console.log("Generating final summary...");
//   const finalSummary = await summaryChain.invoke({
//     analysis: currentAnalysis
//   });

//   return {
//     chunkResponses: chunkResponses,
//     finalSummary: finalSummary
//   };
// }

async function analyzeGitHubData(userQuery, queryResult) {
  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 4000,
    chunkOverlap: 200,
  });

  // Convert queryResult to string and split into chunks
  const githubDataString = JSON.stringify(queryResult, null, 2);
  const chunks = await textSplitter.createDocuments([githubDataString]);

  // Initialize the analysis prompt
  const analysisPrompt = ChatPromptTemplate.fromTemplate(`
    You are a GitHub data analyst assistant. Analyze the provided GitHub data chunk and answer the user's query.
    Previous analysis: {previousAnalysis}

    User Query: {userQuery}

    GitHub Data Chunk:
    {githubDataChunk}

    Please provide an updated analysis based on this new chunk of data.
    Focus on the aspects mentioned in the user's query.
    If this chunk doesn't contain new relevant information, state that and maintain the previous analysis.
    When mentioning repositories, always include their full names (username/repo-name) for later reference.

    Your response:
  `);

  const analysisChain = analysisPrompt.pipe(model).pipe(new StringOutputParser());

  // Initialize the summary prompt with instructions to include full repo names
  const summaryPrompt = ChatPromptTemplate.fromTemplate(`
    Summarize the following GitHub data analysis:
    {analysis}

    Provide a concise summary that captures the key points of the analysis.
    Ensure to mention full repository names (username/repo-name) for all projects discussed.
    Your summary:
  `);

  const summaryChain = summaryPrompt.pipe(model).pipe(new StringOutputParser());

  let currentAnalysis = "No analysis yet.";
  let chunkResponses = [];

  // Process each chunk iteratively
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1} of ${chunks.length}`);
    
    const chunkAnalysis = await analysisChain.invoke({
      userQuery: userQuery,
      githubDataChunk: chunks[i].pageContent,
      previousAnalysis: currentAnalysis
    });

    currentAnalysis = chunkAnalysis;

    chunkResponses.push({
      chunkNumber: i + 1,
      chunkContent: chunks[i].pageContent.substring(0, 100) + "...", // First 100 characters for brevity
      response: chunkAnalysis
    });

    console.log(`Chunk ${i + 1} analysis:`);
    console.log(chunkAnalysis);
    console.log("--------------------");
  }

  // Generate a final summary
  console.log("Generating final summary...");
  const finalSummary = await summaryChain.invoke({
    analysis: currentAnalysis
  });

  // Function to extract repo names and create GitHub links
  function extractRepoLinks(text) {
    const repoPattern = /\b([a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+)\b/g;
    const repos = text.match(repoPattern) || [];
    const repoLinks = repos.map(repo => `[${repo}](https://github.com/${repo})`);
    return repoLinks;
  }

  // Extract repo links from the final summary
  const repoLinks = extractRepoLinks(finalSummary);

  // Add repository links to the final response
  let finalResponse = finalSummary;
  if (repoLinks.length > 0) {
    finalResponse += "\n\nRelevant repository links:\n" + repoLinks.join("\n");
  }

  return {
    chunkResponses: chunkResponses,
    finalSummary: finalResponse
  };
}

function summarizeGitHubData(data) {
  let summary = "";

  if (Array.isArray(data)) {
    summary += `Array of ${data.length} items. Sample items:\n`;
    summary += JSON.stringify(data.slice(0, 3), null, 2);
  } else if (typeof data === 'object' && data !== null) {
    summary += "Object with keys:\n";
    summary += Object.keys(data).join(', ') + "\n\n";
    summary += "Sample of data:\n";
    const sampleData = Object.fromEntries(
      Object.entries(data).slice(0, 5).map(([key, value]) => [
        key,
        Array.isArray(value) ? `Array of ${value.length} items` : value
      ])
    );
    summary += JSON.stringify(sampleData, null, 2);
  } else {
    summary = String(data);
  }

  return summary;
}

// Directories and files to exclude
const excludePatterns = [
  'node_modules',
  'artifacts',
  '.git',
  '.history',
  '.vscode',
  'build',
  'dist',
  'out',
  'target',
  'vendor',
  '.next',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  '*.log',
  '*.tmp',
  '*.temp',
  '.cache',
  '.DS_Store',
  'Thumbs.db',
  '*.bak',
  '*.swp',
  '*~',
];

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

async function fetchRepoTrees(username) {
  const { data: repos } = await octokit.repos.listForUser({ username });
  const trees = {};

  for (const repo of repos) {
    try {
      trees[repo.name] = await fetchCompleteTree(username, repo.name, repo.default_branch);
    } catch (error) {
      console.error(`Error fetching tree for ${repo.name}:`, error);
      trees[repo.name] = []; // Empty array for repos we couldn't fetch
    }
  }

  return trees;
}

async function fetchCompleteTree(owner, repo, branch) {
  const allPaths = [];
  await fetchTreeRecursive(owner, repo, branch, '', allPaths);
  return allPaths;
}

async function fetchTreeRecursive(owner, repo, sha, path, allPaths) {
  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: sha,
  });

  for (const item of tree.tree) {
    const fullPath = path ? `${path}/${item.path}` : item.path;
    console.log("fullPath: ",fullPath)
    if (shouldIncludePath(fullPath, item.size)) {
      if (item.type === 'blob') {
        allPaths.push(fullPath);
      } else if (item.type === 'tree') {
        await fetchTreeRecursive(owner, repo, item.sha, fullPath, allPaths);
      }
    }
  }
}

function shouldIncludePath(path, size) {
  // Check if the path or any of its parent directories match the exclude patterns
  const pathParts = path.split('/');
  for (let i = 0; i < pathParts.length; i++) {
    const partialPath = pathParts.slice(0, i + 1).join('/');
    if (excludePatterns.some(pattern => {
      if (pattern.includes('*')) {
        // For patterns with wildcards, use minimatch
        return minimatch(partialPath, pattern, { matchBase: true });
      } else {
        // For exact matches
        return partialPath === pattern || partialPath.startsWith(pattern + '/');
      }
    })) {
      return false;
    }
  }

  // Check file size
  return size === undefined || size <= MAX_FILE_SIZE;
}

// You'll need to import or implement a minimatch function
// Here's a simple implementation for demonstration purposes
function minimatch(path, pattern, options) {
  const regex = new RegExp('^' + pattern.split('*').map(escapeRegExp).join('.*') + '$', options.matchBase ? 'i' : '');
  return regex.test(path);
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ... rest of the code remains the same
async function handleGitHubQuery(breakdown,username,userQuery) {
  // Step 2: Determine if file content is needed
  const needsFileContent = breakdown.requiredData.includes('file_contents');

  console.log("needsFileContent : ",needsFileContent)
  let data;
  if (needsFileContent) {
    // Step 3a: Fetch repo trees
    const repoTrees = await fetchRepoTrees(username); 
    console.log("repoTrees : ",repoTrees)
    // Step 3b: Ask LLM for relevant file paths
    const relevantPaths = await getRelevantFilePaths(repoTrees, userQuery);
    console.log("relevantPaths : ",relevantPaths)
    // Step 3c: Fetch data including file contents
    data = await _fetchGitHubData(breakdown, username, relevantPaths);
    console.log("Final Data: ",data)
  } else {
    console.log("doesn't contain any file contents")
    // Step 3: Fetch GitHub data without file contents
    data = await _fetchGitHubData(breakdown,username);
  }

 // Step 4: Analyze data and generate response
  // data = await _fetchGitHubData(breakdown,username)
  console.log(data)
  // const response = await analyzeGitHubData(userQuery, data);
  // console.log("Response: ",response)
  // return response;
}


async function getRelevantFilePaths(repoTrees, userQuery) {
  const structuredLLM = model.withStructuredOutput({
    name: "relevantFilePaths",
    description: "Relevant file paths based on the user query and repository structures",
    parameters: {
      type: "object",
      properties: {
        relevantPaths: {
          type: "array",
          items: {
            type: "object",
            properties: {
              repo: { type: "string", description: "Repository name" },
              path: { type: "string", description: "File path within the repository" },
              reason: { type: "string", description: "Reason why this file is relevant" }
            },
            required: ["repo", "path", "reason"]
          },
          description: "List of relevant file paths across repositories"
        }
      },
      required: ["relevantPaths"]
    }
  });

  const analysisPrompt = ChatPromptTemplate.fromTemplate(`
    Given the following repository file structures chunk and user query, 
    identify the most relevant file paths that might contain information to answer the query.
    Provide the repository name, file path, and a brief reason for each relevant file.
    Consider the previous analysis when making your decisions.

    User Query: {userQuery}

    Previous Analysis: {previousAnalysis}

    Repository Structures Chunk:
    {repoStructuresChunk}

    Relevant file paths:
  `);

  const analysisChain = analysisPrompt.pipe(structuredLLM);

  const summaryPrompt = ChatPromptTemplate.fromTemplate(`
    Summarize the following file path analysis results:
    {analysis}

    Provide a concise list of the most relevant file paths, including repository, path, and reason.
    Your summary:
  `);

  const summaryChain = summaryPrompt.pipe(structuredLLM);

  const repoStructures = Object.entries(repoTrees)
    .map(([repoName, paths]) => `${repoName}:\n${paths.join('\n')}`)
    .join('\n\n');

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 4000,
    chunkOverlap: 200,
  });

  const chunks = await textSplitter.createDocuments([repoStructures]);

  let currentAnalysis = { relevantPaths: [] };
  let chunkResponses = [];

  // Process each chunk iteratively
  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i + 1} of ${chunks.length}`);
    
    const chunkAnalysis = await analysisChain.invoke({
      userQuery: userQuery,
      repoStructuresChunk: chunks[i].pageContent,
      previousAnalysis: JSON.stringify(currentAnalysis)
    });

    // Merge the new analysis with the current analysis
    currentAnalysis.relevantPaths = [
      ...currentAnalysis.relevantPaths,
      ...chunkAnalysis.relevantPaths
    ];

    // Store the response for this chunk
    chunkResponses.push({
      chunkNumber: i + 1,
      chunkContent: chunks[i].pageContent.substring(0, 100) + "...", // First 100 characters for brevity
      response: chunkAnalysis
    });

    console.log(`Chunk ${i + 1} analysis:`, chunkAnalysis);
    console.log("--------------------");
  }

  // Generate final summary
  const finalSummary = await summaryChain.invoke({
    analysis: JSON.stringify(currentAnalysis)
  });

  console.log("Final Summary of Relevant Paths:", finalSummary);

  return finalSummary.relevantPaths;
}

function formatDbQuery(username, queryParams) {
  // Create the outer object with username
  const formattedQuery = { username };

  // Create an inner object for the query parameters
  const innerQuery = {};

  // Add the dbQuery properties to the inner object
  if (queryParams.dbQuery) {
    const relevantFields = ['sortBy', 'sortOrder', 'limit', 'language', 'minStars', 'minForks', 'dateField', 'dateFrom', 'dateTo', 'keyword'];
    
    for (const field of relevantFields) {
      if (queryParams.dbQuery[field] !== undefined) {
        innerQuery[field] = queryParams.dbQuery[field];
      }
    }

    // Rename 'stars' to 'stargazers_count' if it's used as sortBy
    if (innerQuery.sortBy === 'stars') {
      innerQuery.sortBy = 'stargazers_count';
    }
  }

  // Add the inner object to the formatted query
  formattedQuery[Symbol.for('queryParams')] = innerQuery;

  return formattedQuery;
}

async function useFormattedQuery(formattedQuery) {
  // Extract username and options from the formatted query
  const { username, ...options } = formattedQuery;

  // If the options are nested in a symbol-keyed object, extract them
  const queryOptions = options[Symbol.for('queryParams')] || options;

  try {
    // Call queryUserRepos with the extracted username and options
    const repos = await queryUserRepos(username, queryOptions);
    
    console.log(`Found ${repos.length} repositories for user ${username}`);
    return repos;
  } catch (error) {
    console.error('Error querying user repos:', error);
    throw error;
  }
}



(async()=>{ 

   const queries = [
    "What programming languages does the user work with across their repositories?",
  //       //  "Show me the best work?",
  //       //  "What programming languages he is good at?",
  //       //  "How long he has been doing the programming?",
      // "Show me some of his recent work (at least 10 repos)",
  // "What are the top repos?",
        // "Does he has work with Python? show me top 3 the Python projects",
  //     //  "How long he has been a developer?"
  //   // "What are the primary programming languages this developer uses, based on their repository contributions?",
  //     // "How active is this developer on GitHub? Can you provide statistics on their commit frequency and consistency over the past year?",
  //   //"What types of projects does this developer work on most frequently? Are they mostly personal projects, open-source contributions, or professional work?",
  //   // "Can you identify any significant or popular open-source projects this developer has contributed to?",
  //   // "What is the average complexity of the code this developer writes, based on metrics like cyclomatic complexity or lines of code per function?",
  //   //  "How well does this developer document their code? Can you provide examples of their commenting style and README files?",
  // //   "Does the developer have experience with version control best practices, such as creating meaningful commit messages and using feature branches?",
  //    "Are there any particular areas of expertise or specialization evident from the developer's repositories and contributions?",
  // //   "How does this developer handle error handling and testing in their projects? Can you provide examples of unit tests or error handling patterns they commonly use?",
  //     //  "Can you identify any patterns in the developer's problem-solving approach or coding style based on their commit history and code samples?"
     ];

  // const queries = [
    // Developer queries
    // "Top repos?",
    //  "Main languages used?", //bit okay 
    //  "Coding experience?", // Model can't interpret this query
    //  "Recent projects?",
    //  "Any Python work?",
    // "Open-source contributions?",
    // "Code complexity?",
    // "Documentation style?",
    // "Testing approach?",
    // "Commit patterns?",
  
    // Client queries (both technical and non-technical)
    // "Best projects?",
    // "How long coding?",
    // "Active on GitHub?",
    // "Project types?",
    // "Popular contributions?",
    // "Code quality?",
    // "Expertise areas?",
    // "Error handling?",
    // "Problem-solving style?",
    // "Version control use?"
  // ];

  const results = [];

    for (const userQuery of queries) {
      try {
          console.log(`Query: ${userQuery}`);
          // Expand the user query 
        const expandedQuery = await expandQuery(userQuery,githubApiContext)
        console.log(`Expanded Query: ${expandedQuery}`);

        //console.log("LLM generated query parameters:", JSON.stringify(queryParams, null, 2));
        // Breakdown the expanded query into more structured way so the context can be fetched
        const newqueryParams = await breakdownQuery(expandedQuery);
        console.log("LLM generated query parameters :", JSON.stringify(newqueryParams, null, 2));
        // results.push({ query: userQuery, params: queryParams });
        
        const formattedQuery = formatDbQuery("aduttya", newqueryParams);
        console.log(await useFormattedQuery(formattedQuery))
        // await handleGitHubQuery(newqueryParams,"aduttya",expandedQuery)
        // Fetch the github data points dedcuted from newqueryparams
        // const queryResult = await _fetchGitHubData(newqueryParams,"aduttya");
        // console.log(queryResult)

        // const analysis = await analyzeGitHubData(userQuery, queryResult);


        // console.log("Chunk-by-chunk analysis:");
        // analysis.chunkResponses.forEach(chunk => {
        //   console.log(`Chunk ${chunk.chunkNumber}:`);
        //   console.log(`Content preview: ${chunk.chunkContent}`);
        //   console.log(`Response: ${chunk.response}`);
        //   console.log("--------------------");
        // });
      
        // console.log("Final Summary:");
        // console.log(analysis.finalSummary);
      

        
      } catch (error) {
        console.error(`Failed to process query: ${userQuery}`, error);
      }
  }

    

    // const data = await fetchGithubData("aduttya")
    // await storeGithubData(data)

    // await saveAllDocsToJson();

    // await queryRustProjects()
    
})()
  
