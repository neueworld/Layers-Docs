import { config } from "dotenv";
config()
import { DynamicStructuredTool } from "@langchain/core/tools";
import {GitHubDataToolWrapped,workExperienceTool,GitHubDataLangChainTool} from './githubtool.mjs'; 
import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Redis } from "ioredis";
import { RedisByteStore } from "@langchain/community/storage/ioredis";
import { CacheBackedEmbeddings } from "langchain/embeddings/cache_backed";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "langchain/vectorstores/memory";


const model = new ChatOpenAI({ model: "gpt-4" });
const underlyingEmbeddings = new OpenAIEmbeddings();

const redisClient = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  // Add password if needed: password: process.env.REDIS_PASSWORD,
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
  // Implement appropriate error handling for your application
});

const GitHubDataTool = new DynamicStructuredTool({
  name: "GitHubDataTool",
  description: "Fetches data from a GitHub repository",
  schema: z.object({
    owner: z.string().describe("The owner of the GitHub repository"),
    repo: z.string().describe("The name of the GitHub repository"),
    fields: z.array(z.string()).describe("List of fields to fetch from the repository"),
  }),
  func: async ({ owner, repo, fields }) => {
    const toolInstance = new GitHubDataLangChainTool({ owner, repo });
    return JSON.stringify(await toolInstance.fetchRepoData(fields));
  },
});

const modelWithTools = model.bindTools([GitHubDataTool]);

const redisStore = new RedisByteStore({
  client: redisClient,
});

const cacheBackedEmbeddings = CacheBackedEmbeddings.fromBytesStore(
  underlyingEmbeddings,
  redisStore,
  {
    namespace: underlyingEmbeddings.modelName,
  }
);
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 0,
});


(async()=>{

  const initialData = await GitHubDataTool.func({
    owner: "neueworld",
    repo: "Proof-Engine",
    fields: ["readme", "languages", "tags", "contributors", "commits"]
  });

  // console.log(JSON.stringify(initialData))


  // const loader = new TextLoader("./jay.pdf");
  // const rawDocuments = await loader.load();
  // console.log(rawDocuments)
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 0,
  });
  const output = await splitter.createDocuments([JSON.stringify(initialData, null, 2)]);
  // const documents = await splitter.splitDocuments(output);
  const vectorStore = await MemoryVectorStore.fromDocuments(
    output,
    cacheBackedEmbeddings
  );

  const resultOne = await vectorStore.similaritySearch("tech", 1);

  console.log("The result : ",resultOne);
    
  // console.log(documents)
  // const res = await embeddings.embedQuery(JSON.stringify(initialData, null, 2));
  // console.log(res)

})()