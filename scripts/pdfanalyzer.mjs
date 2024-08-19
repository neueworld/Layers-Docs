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
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import readline from 'readline';


const model = new ChatOpenAI({ model: "gpt-4" });
const underlyingEmbeddings = new OpenAIEmbeddings();

// const redisClient = new Redis({
//   host: process.env.REDIS_HOST || 'localhost',
//   port: process.env.REDIS_PORT || 6379,
//   // Add password if needed: password: process.env.REDIS_PASSWORD,
// });

// redisClient.on('error', (err) => {
//   console.error('Redis Client Error', err);
//   // Implement appropriate error handling for your application
// });


// const redisStore = new RedisByteStore({
//   client: redisClient,
// });

// const cacheBackedEmbeddings = CacheBackedEmbeddings.fromBytesStore(
//   underlyingEmbeddings,
//   redisStore,
//   {
//     namespace: underlyingEmbeddings.modelName,
//   }
// );
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 0,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askQuestion(retrievalChain) {
  return new Promise((resolve) => {
    rl.question("Enter your question (or type 'exit' or '0' to quit): ", async (question) => {
      if (question.toLowerCase() === 'exit' || question === '0') {
        resolve(false);
        return;
      }

      const result = await retrievalChain.invoke({
        input: question,
      });
      console.log(`Question: ${question}`);
      console.log(`Answer: ${result.answer}`);
      console.log(); // Add a blank line for readability

      resolve(true);
    });
  });
}


// const chain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());

// // Function to ask questions
// async function askQuestion(question) {
//   const result = await chain.call({
//     query: question,
//   });
//   console.log(`Question: ${question}`);
//   console.log(`Answer: ${result.text}`);
// }


// async function main() {
//   // Load the document
//   const loader = new PDFLoader("./jay.pdf");
//   const rawDocuments = await loader.load();
//   const documents = await splitter.splitDocuments(rawDocuments);

//   // Create embeddings and LLM instances
//   const embeddings = new OpenAIEmbeddings();
//   const llm = new ChatOpenAI();

//   // Create the vector store
//   const vectorstore = await MemoryVectorStore.fromDocuments(
//     documents,
//     embeddings
//   );

//   // Create the prompt template
//   // const prompt = ChatPromptTemplate.fromTemplate(`Answer the user's question: {input} based on the following context: {context}`);
//   const prompt = ChatPromptTemplate.fromTemplate(`Answer the user's question based on the following context. If the answer cannot be found in the context, say "I don't have enough information to answer that question."
//     Context: {context}
    
//     Question: {input}
    
//     Answer:`);
    
//   // Create the combine documents chain
//   const combineDocsChain = await createStuffDocumentsChain({
//     llm,
//     prompt,
//   });

//   // Create the retriever
//   const retriever = vectorstore.asRetriever({
//     searchKwargs: {
//       k: 3, // Retrieve top 3 chunks
//     },
//   });

//   // Create the retrieval chain
//   const retrievalChain = await createRetrievalChain({
//     combineDocsChain,
//     retriever,
//   });

//   // Function to ask questions
//   async function askQuestion(question) {
//     const result = await retrievalChain.invoke({
//       input: question,
//     });
//     console.log(`Question: ${question}`);
//     console.log(`Answer: ${result.answer}`);
//   }

//   // Example usage
//   await askQuestion("What is the main topic of the document?");
//   await askQuestion("Can you summarize the key points?");
// }

async function main() {
  // Load and prepare the document
  const loader = new PDFLoader("./jay.pdf");
  const rawDocuments = await loader.load();
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });
  const documents = await splitter.splitDocuments(rawDocuments);

  // Create embeddings and LLM instances
  const embeddings = new OpenAIEmbeddings();
  const llm = new ChatOpenAI();

  // Create the vector store
  const vectorstore = await MemoryVectorStore.fromDocuments(
    documents,
    embeddings
  );

  // Create the prompt template
  const prompt = ChatPromptTemplate.fromTemplate(`Answer the user's question based on the following context. If the answer cannot be found in the context, say "I don't have enough information to answer that question."

Context: {context}

Question: {input}

Answer:`);

  // Create the combine documents chain
  const combineDocsChain = await createStuffDocumentsChain({
    llm,
    prompt,
  });

  // Create the retriever
  const retriever = vectorstore.asRetriever({
    searchKwargs: {
      k: 3, // Retrieve top 3 chunks
    },
  });

  // Create the retrieval chain
  const retrievalChain = await createRetrievalChain({
    combineDocsChain,
    retriever,
  });

  console.log("PDF loaded and processed. Ready for questions!");

  let continueAsking = true;
  while (continueAsking) {
    continueAsking = await askQuestion(retrievalChain);
  }

  console.log("Thank you for using the Q&A system. Goodbye!");
  rl.close();
}

main().catch(console.error);