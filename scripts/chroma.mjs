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
    const repos = await octokit.repos.listForUser({ username });
  
    const githubData = {
      basicDetails: {
        name: userData.data.name,
        login: userData.data.login,
        followers: userData.data.followers,
        following: userData.data.following,
      },
      description: userData.data.bio,
      url: userData.data.html_url,
      languages: new Set(),
      techStack: new Set(),
      repos: [],
    };
  
    for (const repo of repos.data) {
      const repoLanguages = await octokit.repos.listLanguages({ owner: username, repo: repo.name });
      let readme = null;
      try {
        const readmeResponse = await octokit.repos.getReadme({ owner: username, repo: repo.name });
        readme = Buffer.from(readmeResponse.data.content, 'base64').toString();
      } catch (error) {
        if (error.status === 404) {
          console.log(`README not found for ${repo.name}`);
        } else {
          console.error(`Error fetching README for ${repo.name}:`, error);
        }
      }
      const contributors = await octokit.repos.listContributors({ owner: username, repo: repo.name });
  
      const repoData = {
        name: repo.name,
        readme: readme,
        languages: Object.keys(repoLanguages.data),
        techStack: [], // You might need to implement logic to extract tech stack from readme
        createdAt: repo.created_at,
        stars: repo.stargazers_count,
        watchers: repo.watchers_count,
        lastUpdated: repo.updated_at,
        lastUpdateDescription: repo.description,
        contributors: contributors.data.map(c => c.login),
      };
  
      githubData.repos.push(repoData);
      repoData.languages.forEach(lang => githubData.languages.add(lang));
      // Add logic to extract tech stack and add to githubData.techStack
    }
  
    githubData.languages = Array.from(githubData.languages);
    githubData.techStack = Array.from(githubData.techStack);
    
    return githubData;
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
  
    // Store user overview (no chunking needed as it's small)
    documents.push(new Document({
      pageContent: JSON.stringify({
        type: "user_overview",
        name: githubData.basicDetails.name,
        login: githubData.basicDetails.login,
        bio: githubData.description,
        url: githubData.url,
        allLanguages: Array.from(githubData.languages),
      }),
      metadata: { type: "user_overview" }
    }));
  
    // Store each repo, chunking if necessary
    for (const repo of githubData.repos) {
      const repoDoc = new Document({
        pageContent: JSON.stringify({
          type: "repo",
          name: repo.name,
          languages: repo.languages,
          description: repo.lastUpdateDescription,
          createdAt: repo.createdAt,
          lastUpdated: repo.lastUpdated,
          stars: repo.stars,
          watchers: repo.watchers,
          readme: repo.readme,
        }),
        metadata: { type: "repo", name: repo.name }
      });
  
      const chunkedDocs = await chunkDocument(repoDoc);
      documents.push(...chunkedDocs);
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
  function parseJSONSafely(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return jsonString; // Return the original string if parsing fails
    }
  }
  
  async function createGitHubDataChatbot() {
    const retriever = vectorStore.asRetriever({
      k: 3
    });
  
    const template = `You are an AI assistant that answers questions about a GitHub user and their repositories based on the following context. If the information is not in the context, say you don't have that information.
  
  Context:
  {context}
  
  Question: {question}
  
  Answer:`;
  
    const prompt = ChatPromptTemplate.fromTemplate(template);
  
    const retrievalChain = RunnableSequence.from([
      {
        context: retriever.pipe(docs => 
          docs.map(doc => `${doc.metadata.type || 'Unknown Type'}:\n${doc.pageContent}`).join('\n\n')
        ),
        question: new RunnablePassthrough(),
      },
      {
        originalContext: (input) => input.context,
        formattedInput: prompt,
      },
      {
        context: (input) => {
          console.log("\nRetrieved Context:");
          console.log(input.originalContext);
          return input.originalContext;
        },
        response: (input) => model.invoke(input.formattedInput),
      },
      {
        response: (input) => input.response,
      },
      new StringOutputParser(),
    ]);
  
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  
    console.log("GitHub Data Chatbot: Ask me anything about the GitHub user and their repositories. Enter '0' to exit.");
  
    while (true) {
      const question = await new Promise(resolve => {
        rl.question("You: ", resolve);
      });
  
      if (question === '0') {
        console.log("Chatbot: Goodbye!");
        rl.close();
        break;
      }
  
      try {
        const response = await retrievalChain.invoke(question);
        console.log("Chatbot:", response);
      } catch (error) {
        console.error("Error:", error);
        console.log("Chatbot: I'm sorry, I encountered an error while processing your question. Please try again.");
      }
    }
  }
  
  
  
  
  
  
  
  
  
  
  
(async()=>{ 

    // await queryVectorStore("what are the top languages")
    // await queryVectorStoreWithRetriever("what are the top languages")

    await createGitHubDataChatbot()
    // const data = await fetchGithubData("aduttya")
    // await storeGithubData(data)
    // await viewSavedData()

})()
  
