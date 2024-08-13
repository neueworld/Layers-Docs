import { Octokit } from "@octokit/rest";
import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Document } from "@langchain/core/documents";
import { z } from "zod";


import dotenv from 'dotenv';

dotenv.config();

const octokit = new Octokit({ auth: process.env.GT_TOKEN });

async function getRepoContent(owner, repo, path = '', maxDepth = 3, currentDepth = 0) {
    if (maxDepth < 0) return { content: [], size: 0 };
  
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path
      });
  
      let allContent = [];
      let totalSize = 0;
  
      for (const item of Array.isArray(data) ? data : [data]) {
        console.log(`${'  '.repeat(currentDepth)}${item.type === 'dir' ? '📁' : '📄'} ${item.name}`);
        
        if (item.type === 'dir') {
          const { content: subContent, size: subSize } = await getRepoContent(owner, repo, item.path, maxDepth - 1, currentDepth + 1);
          allContent.push({
            ...item,
            contents: subContent
          });
          totalSize += subSize;
        } else {
          allContent.push(item);
          totalSize += item.size || 0;  // Use 0 if size is undefined
        }
      }
  
      return { content: allContent, size: totalSize };
    } catch (error) {
      console.error(`Error fetching content for ${path}: ${error.message}`);
      return { content: [], size: 0 };
    }
}

async function getRepoLanguages(owner, repo) {
  const { data } = await octokit.repos.listLanguages({
    owner,
    repo
  });
  return data;
}

function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

async function splitRepoContent(repoContent) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
  
    const docs = [];
    for (const item of repoContent) {
      const itemContent = JSON.stringify(item, null, 2);
      const splitDocs = await splitter.createDocuments([itemContent], [
        { path: item.path, type: item.type }
      ]);
      docs.push(...splitDocs);
    }
  
    return docs;
}

async function createRepoQA(splitDocs) {
    const vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, new OpenAIEmbeddings());
    const model = new ChatOpenAI({ modelName: "gpt-4" });
    const qa = RetrievalQA.fromLLM(model, vectorStore.asRetriever());
    
    return qa;
}
  
// async function analyzeRepo(owner, repo) {
//     console.log(`Analyzing repository: ${owner}/${repo}\n`);
//     const { content, size } = await getRepoContent(owner, repo);
//     console.log(`\nTotal repository size: ${formatSize(size)}`);
//     const splitted_content = await splitRepoContent(content)
//     console.log("splitted content : ",splitted_content)
//     const languages = await getRepoLanguages(owner, repo);
//     console.log("\nLanguages used:");
//     console.log(languages);

//     const splitDocs = await splitRepoContent(repoContent);
//     console.log(`Repository content split into ${splitDocs.length} chunks`);

//     const qaChain = await createRepoQAChain(splitDocs);

//     const frameworkPrompt = `
//     Based on the repository structure and content, what framework or main technology does this repository use?
//     Consider the file structure, dependencies, and any configuration files.
//     If you're not certain, explain your reasoning and any possibilities you see.
//     `;
//     const frameworkRes = await qaChain.call({ query: frameworkPrompt });

//     const codeQualityPrompt = `
//     Assess the overall code quality of this repository. Consider the following aspects:
//     1. Code organization and structure
//     2. Naming conventions
//     3. Presence of comments and documentation
//     4. Use of best practices for the identified framework/language
//     5. Any potential issues or areas for improvement
//     Provide a detailed analysis, citing specific examples from the repository where possible.
//     `;
//     const codeQualityRes = await qaChain.call({ query: codeQualityPrompt });

//     return {
//         framework: frameworkRes.text,
//         codeQuality: codeQualityRes.text
//     };
  
//     return { content, size, languages };
// }



const formatDocumentsAsString = (documents) => {
  return documents.map((doc) => doc.pageContent).join("\n\n");
};


async function analyzeRepo(repoContent) {
  // Define Zod schema for structured output
  const techStackSchema = z.object({
    mainTechnology: z.string().describe("The primary technology or framework used in the repository"),
    programmingLanguages: z.array(z.string()).describe("Programming languages identified in the repository"),
    frameworks: z.array(z.string()).describe("Frameworks or libraries used in the project"),
    buildTools: z.array(z.string()).describe("Build tools or package managers used"),
    databases: z.array(z.string()).describe("Databases or data storage solutions used"),
    deploymentTools: z.array(z.string()).describe("Deployment or containerization tools used"),
    cicdTools: z.array(z.string()).describe("CI/CD tools or platforms used"),
    otherTechnologies: z.array(z.string()).describe("Other notable technologies or tools identified"),
    possibleFrameworks: z.array(z.string()).describe("Possible frameworks based on project structure or dependencies"),
    reasoning: z.string().describe("Explanation for the technology stack identification"),
  });

  try {
    // Initialize the LLM
    const model = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0,
    });

    // Split the repository content
    const textSplitter = new RecursiveCharacterTextSplitter({ 
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const docs = await textSplitter.createDocuments(
      repoContent.content.map(item => JSON.stringify(item)),
      repoContent.content.map(item => ({ path: item.path, type: item.type }))
    );

    // Create a vector store from the documents
    const vectorStore = await MemoryVectorStore.fromDocuments(
      docs,
      new OpenAIEmbeddings()
    );

    // Initialize a retriever wrapper around the vector store
    const vectorStoreRetriever = vectorStore.asRetriever();

    // Create a system & human prompt for the chat model
    const SYSTEM_TEMPLATE = `Analyze the following pieces of a GitHub repository to identify the technology stack used.
    Focus on identifying the main technology, programming languages, frameworks, build tools, databases, deployment tools, CI/CD tools, and any other notable technologies.
    If you can't identify certain aspects based on the given information, indicate that they are unknown or not applicable.
    ----------------
    {context}`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_TEMPLATE],
      ["human", "{question}"],
    ]);

    const chain = RunnableSequence.from([
      {
        context: vectorStoreRetriever.pipe(formatDocumentsAsString),
        question: new RunnablePassthrough(),
      },
      prompt,
      model,
      new StringOutputParser(),
    ]);

    // Analyze tech stack
    const techStackPrompt = `
    Based on the repository structure and content, identify the complete technology stack used in this project.
    Consider file types, dependencies, configuration files, and any other relevant information.
    Provide a comprehensive analysis of the technologies used and explain your reasoning.
    `;
    const structuredTechStackLlm = model.withStructuredOutput(techStackSchema);
    const techStackAnalysis = await structuredTechStackLlm.invoke(await chain.invoke(techStackPrompt));

    return techStackAnalysis;
  } catch (error) {
    console.error("Error in analyzeRepo:", error);

    // Prepare a fallback response
    const fallbackAnalysis = {
      mainTechnology: "Unknown",
      programmingLanguages: [],
      frameworks: [],
      buildTools: [],
      databases: [],
      deploymentTools: [],
      cicdTools: [],
      otherTechnologies: [],
      reasoning: "Analysis failed due to an error: " + error.message,
    };

    return fallbackAnalysis;
  }
}

  

(async()=>{

    // const { content, size, languages } = await analyzeRepo('neueworld', 'neueworld');
    try {
        const repoContent = await getRepoContent('neueworld', 'layers');
        console.log("The repo content : ",repoContent)
        const analysis = await analyzeRepo(repoContent);
        
        console.log("Framework Analysis:", analysis);
      } catch (error) {
        console.error('An error occurred during repository analysis:', error);
      }
    
    // const languages = await getRepoLanguages("neueworld","Proof-Engine")
    // console.log(languages)
     
    //  const data = await getRepoContent("neueworld","Proof-Engine")
    //  console.log(data)

})()

