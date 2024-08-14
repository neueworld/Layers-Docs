import { config } from "dotenv";
config()
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { PromptTemplate } from "@langchain/core/prompts";

import { StringOutputParser } from "@langchain/core/output_parsers";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { prompts, promptMappings,fetchRepoData,getTechStack } from './utility.mjs';
import {GitHubDataToolWrapped,workExperienceTool,GitHubDataLangChainTool} from './githubtool.mjs'; 
import { createOpenAIFunctionsAgent,AgentExecutor} from "langchain/agents";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { HumanMessage, SystemMessage,AIMessage } from "@langchain/core/messages";
import { TokenTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

import { CacheBackedEmbeddings } from "langchain/embeddings/cache_backed";
import { InMemoryStore } from "@langchain/core/stores";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { FaissStore } from "@langchain/community/vectorstores/faiss";


const model = new ChatOpenAI({ model: "gpt-4" });
const parser = new StringOutputParser();


// const githubDataTool = new GitHubDataToolWrapped({ owner: "neueworld", repo: "layers" });

// Ensure the tool is properly added to the agent's tools array
const agentTools = [GitHubDataToolWrapped,workExperienceTool];

const agentCheckpointer = new MemorySaver();

const agent = createReactAgent({
  llm: model,
  tools: agentTools,

});

const messages = [
  new SystemMessage("Translate the following from English into Hindi"),
  new HumanMessage("hi!"),
];


// const chain = promptTemplate.pipe(model).pipe(parser);
// const result = await chain.invoke({ language: "italian", text: "Good Bye" });

// console.log(result)

async function fetchAndSendRepoData(owner, repo, selectedPromptKey) {
  try {
    //   const fields = promptMappings[selectedPromptKey];
    //   const repoData = await fetchRepoData(owner, repo, fields);
      
    //   if (fields.includes('techStack')) {
    //       repoData.techStack = await getTechStack(owner, repo);
    //   }
  
    //   const data = {
    //       url: `https://github.com/${owner}/${repo}`,
    //       ...repoData
    //   };
      

    // const prompt = prompts[selectedPromptKey];
    // const systemTemplate = "Generate content based on the following data:";
    // const userTemplate = "{prompt}\n\n{data}";
    // const promptTemplate = ChatPromptTemplate.fromMessages([
    //   ["system", prompt],
    //   ["user", userTemplate],
    // ]);

    // const chain = promptTemplate.pipe(model).pipe(parser);
    // const result = await chain.invoke({ 
    //   prompt: prompt,
    //   data: JSON.stringify(data, null, 2)
    
    // });
    // // const result = await promptTemplate.invoke({ data: JSON.stringify(data, null, 2) });
    // console.log("The result from chain : ",result);


    const modelWithTools = model.bindTools([GitHubDataToolWrapped]);

    const query = "Fetch the languages, readme, and contributors for the 'neueworld/layers' repository on GitHub and summarize the findings.";
  
    // First, let the model decide what data to fetch
    const initialResponse = await modelWithTools.invoke([new HumanMessage(query)]);
    console.log("initial response : ",initialResponse)
    
    // Extract the tool calls from the initial response
    const toolCalls = initialResponse.tool_calls;
    console.log("toolCalls : ",toolCalls)

    if (toolCalls && toolCalls.length > 0) {
      // Execute the tool call
      const toolCall = toolCalls[0];
      const toolResult = await GitHubDataToolWrapped.func(toolCall.args);
      console.log("toolResult : ",toolResult)
      // Parse the JSON result
      const repoData = JSON.parse(toolResult);
      
      // Now, ask the model to summarize the findings
      const summaryResponse = await model.invoke([
        new HumanMessage(query),
        new AIMessage(initialResponse.content),
        new HumanMessage(`Here's the data fetched from the GitHub repository:
          ${JSON.stringify(repoData, null, 2)}
          Please summarize these findings and answer the original query.`)
      ]);
      
      console.log("Summary:", summaryResponse.content);
    } else {
      console.log("No tool calls were made.");
    }
  
    // This is the agent code
    // if (result) {
    //   const agentFinalState = await agent.invoke(
    //     { messages: [new HumanMessage(result)] },  
    //     { configurable: { thread_id: "42" } }
    //   );

    //   console.log("agentFinalState: ",
    //     agentFinalState.messages[agentFinalState.messages.length - 1].content,
    //   );

    //   const agentNextState = await agent.invoke(
    //     { messages: [new HumanMessage("What is the project url?")] },
    //     { configurable: { thread_id: "42" } }
    //   );

    //   console.log("agentNextState : ",
    //     agentNextState.messages[agentNextState.messages.length - 1].content,
    //   );
    // } else {
    //   console.error("Error: No result generated from the chain.");
    // }


  } catch (error) {
      console.error('Error fetching and sending repository data to OpenAI:', error);
  }
}

async function processPdfAndGenerateContent(pdfPath, promptText) {

  // Step 1: Load the PDF file
  const loader = new PDFLoader(pdfPath, { splitPages: false,parsedItemSeparator: "",
  });
  const docs = await loader.load();
  
  // Combine all pages' text into a single string
  const pdfContent = docs.map(doc => doc.pageContent).join("\n");
  if (!pdfContent || pdfContent.trim() === '') {
    throw new Error("The PDF content is empty or could not be extracted.");
}

  console.log("Extracted PDF Content:\n", pdfContent);

  const promptTemplate = new PromptTemplate({
      template: `
    Extract work experience information from the following resume content. 
    Provide the output in the following format:
    
    {format_instructions}
    
    Resume content:
    {resumeContent}
      `,
      inputVariables: ['resumeContent'],
      partialVariables: { format_instructions: parser.getFormatInstructions() }
    });
    
  

  try {
    const prompt = await promptTemplate.format({ resumeContent: pdfContent });
    const result = await model.call(prompt);
    const parsed = await parser.parse(result);
    return parsed;
  } catch (error) {
    console.error('Error extracting work experience:', error);
    throw error;
  }


//   const agent = await createOpenAIFunctionsAgent({
//     llm : model,
//     tools: agentTools,
//     prompt: prompt,
//   });

// const agentExecutor = new AgentExecutor({
//   agent,
//   tools,
// });
//   try {
//     const result = await agentExecutor.invoke({
//       messages: [{ type: 'tool', tool: 'extractWorkExperience', args: { promptText: promptText, pdfContent: pdfContent } }],
//       configurable: { thread_id: "43"}
//     });

//     console.log("Structured Output:\n", result);
//   } catch (error) {
//     console.error("Error during agent invocation:", error);
//   }


//   // Step 2: Prepare the prompt
//   const systemTemplate = "You are given text extracted from a PDF document. Please process the following content and perform the specified task:";
//   const userTemplate = "{promptText}\n\n{pdfContent}";

//   const promptTemplate = ChatPromptTemplate.fromMessages([
//     ["system", systemTemplate],
//     ["user", userTemplate],
//   ]);

//   console.log(promptTemplate)
//   // Step 3: Invoke the AI model
//   const chain = promptTemplate.pipe(model).pipe(parser);

//   const result = await chain.invoke({ 
//     promptText: promptText,
//     pdfContent: pdfContent
//   });

//   // Step 4: Print the output
//   console.log("Generated Content:\n", result);
}

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

// async function answerQuery(query, owner, repo) {
//   // First, let the model decide what data to fetch
//   const initialResponse = await modelWithTools.invoke([
//     new SystemMessage(`You are an AI assistant that helps answer questions about GitHub repositories. 
//     You have access to a tool that can fetch data from GitHub. The repository you're currently working with is owned by '${owner}' and is named '${repo}'.
//     When you need to fetch data, use the GitHubDataTool and always specify the owner as '${owner}' and the repo as '${repo}'.`),
//     new HumanMessage(query)
//   ]);
  
//   // Extract the tool calls from the initial response
//   const toolCalls = initialResponse.tool_calls;
  
//   if (toolCalls && toolCalls.length > 0) {
//     // Execute the tool call
//     const toolCall = toolCalls[0];
//     const toolResult = await GitHubDataTool.func({
//       owner: owner,
//       repo: repo,
//       fields: toolCall.args.fields
//     });
    
//     // Parse the JSON result
//     const repoData = JSON.parse(toolResult);
    
//     // Now, ask the model to answer the query based on the fetched data
//     const answerResponse = await model.invoke([
//       new SystemMessage(`You are an AI assistant that helps answer questions about GitHub repositories. 
//       You have access to data fetched from the '${owner}/${repo}' repository.`),
//       new HumanMessage(query),
//       new AIMessage(initialResponse.content),
//       new HumanMessage(`Here's the data fetched from the GitHub repository:
//         ${JSON.stringify(repoData, null, 2)}
//         Please answer the original query based on this data. Provide a clear and concise explanation suitable for non-technical users.`)
//     ]);
    
//     return answerResponse.content;
//   } else {
//     return "I couldn't fetch the necessary data to answer your query. Could you please rephrase or provide more context?";
//   }
// }


// Initialize cache-backed embeddings
const underlyingEmbeddings = new OpenAIEmbeddings();
const inMemoryStore = new InMemoryStore();
const cacheBackedEmbeddings = CacheBackedEmbeddings.fromBytesStore(
  underlyingEmbeddings,
  inMemoryStore,
  {
    namespace: underlyingEmbeddings.modelName,
  }
);

// Initialize an object to store FaissStore instances for each repository
const repositoryVectorStores = {};

// Create a text splitter instance outside the function to avoid recreation
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

async function answerQuery(query, owner, repo) {
  try {
    // Check if we already have a vector store for this repository
    const repoKey = `${owner}/${repo}`;
    let vectorStore = repositoryVectorStores[repoKey];

    if (!vectorStore) {
      console.log("Creating new vector store for repository:", repoKey);
      
      try {
        // Fetch initial data about the repository
        const initialData = await GitHubDataTool.func({
          owner: owner,
          repo: repo,
          fields: ["description", "readme", "languages"]
        });

        const rawDocuments = [initialData]; // Assume initialData is already an object
        const documents = await splitter.splitDocuments(rawDocuments);

        // Create and store the vector store
        vectorStore = await FaissStore.fromDocuments(documents, cacheBackedEmbeddings);
        repositoryVectorStores[repoKey] = vectorStore;
      } catch (error) {
        console.error("Error creating vector store:", error);
        throw new Error("Failed to initialize repository data");
      }
    }

    // Use modelWithTools to determine what additional data might be needed
    const initialResponse = await modelWithTools.invoke([
      new SystemMessage(`You are an AI assistant that helps answer questions about GitHub repositories. 
      You have access to a tool that can fetch additional data from GitHub if needed. The repository you're currently working with is owned by '${owner}' and is named '${repo}'.
      Determine if you need any additional data to answer the query and request it using the tool. Be specific and request only the necessary data.`),
      new HumanMessage(query)
    ]);

    const toolCalls = initialResponse.additional_kwargs?.tool_calls || [];
    console.log('Tool call arguments:', toolCalls);

    let additionalData = [];
    if (toolCalls.length > 0) {
      // Execute all tool calls
      for (const toolCall of toolCalls) {
        try {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await GitHubDataTool.func({
            owner: owner,
            repo: repo,
            ...args
          });
          const newDocuments = await splitter.splitDocuments([result]);
          await vectorStore.addDocuments(newDocuments);
          additionalData.push({ name: toolCall.function.name, result });
        } catch (error) {
          console.error(`Error processing tool call: ${error.message}`);
        }
      }
    }

    // Perform similarity search
    const relevantChunks = await vectorStore.similaritySearch(query, 5);

    // Final query to answer based on fetched data
    const answerResponse = await model.invoke([
      new SystemMessage(`You are an AI assistant that helps answer questions about GitHub repositories. 
      You have access to relevant data fetched from the '${owner}/${repo}' repository.`),
      new HumanMessage(query),
      new AIMessage(initialResponse.content),
      new HumanMessage(`Here's the relevant data from the GitHub repository:
        ${JSON.stringify(relevantChunks, null, 2)}
        Additional data fetched: ${JSON.stringify(additionalData, null, 2)}
        Please answer the original query based on this data. Provide a clear and concise explanation suitable for non-technical clients.`)
    ]);

    return answerResponse.content;
  } catch (error) {
    console.error('Error in answerQuery:', error);
    return `I encountered an error while trying to answer your query: ${error.message}. Please try again or contact support if the problem persists.`;
  }
}


(async () => {
    
      // const pdfPath = "./Profile.pdf"; 
      // const promptText = "Filter the work and experience from the given file. add the linkedin url too.";
      // await processPdfAndGenerateContent(pdfPath, promptText);
      const owner = "neueworld";
      const repo = "Proof-Engine";
      const queries = [
        "How active is this developer on this project? Can you tell me about their recent contributions?",
        "What can you tell me about the quality of the code in this repository? Is it well-organized and easy to understand?",
        "Does this project show evidence of the developer's ability to work in a team? How so?",
        "Are there any indicators of the developer's problem-solving skills in this repository?",
        "Can you find any examples of the developer implementing best practices or following industry standards?",
        "Does this project demonstrate any particular strengths or specializations of the developer?",
        "Is there evidence of the developer's ability to learn and adapt to new technologies?",
        "How well does the developer document their work? Is the project easy for others to understand and potentially contribute to?",
        "Are there any signs of the developer's attention to detail or commitment to quality in this project?",
        "Based on this repository, what can you tell me about the developer's experience level and expertise?"
      ];
      for (const query of queries) {
        console.log(`Query: ${query}`);
        const answer = await answerQuery(query, owner, repo);
        console.log(`Answer: ${answer}\n`);
      }
    
      // const fields = promptMappings[selectedCategory]
      
      // try {
      //   const data = await githubDataTool.fetchRepoData(fields);
      //   console.log("Fetched GitHub Data:", data);
      // } catch (error) {
      //   console.error("Error during GitHub data fetching:", error);
      // }
    
      // await fetchAndSendRepoData(owner,repo,selectedCategory)

  })();
  

// const result = await model.invoke(messages);
// const answer = await parser.invoke(result)
// console.log(answer)

//This is to fetch the linkedin content
// import { z } from "zod";
// import { StructuredOutputParser } from "langchain/output_parsers";

// // Define the struct using Zod schema
// const resumeSchema = z.object({
//   name: z.string(),
//   email: z.string().email(),
//   linkedIn: z.string().url(),
//   summary: z.string(),
//   skills: z.array(z.string()),
//   experience: z.array(z.object({
//     company: z.string(),
//     position: z.string(),
//     duration: z.string(),
//     description: z.string().optional(),
//   })),
//   education: z.array(z.object({
//     institution: z.string(),
//     degree: z.string(),
//     field: z.string(),
//     year: z.string(),
//   })),
// });

// // Create the output parser
// // const parser = StructuredOutputParser.fromZodSchema(resumeSchema);


// // Create a prompt template
// const prompt = PromptTemplate.fromTemplate(`
//   Extract the following information from the given resume text. If a piece of information is not present, use null or an empty array as appropriate.
  
//   {format_instructions}
  
//   Resume text:
//   {resume_text}
//   `);

// // Function to process PDF content
// async function processPdfContent(pdfContent) {
//   const formatInstructions = parser.getFormatInstructions();

//   const input = await prompt.format({
//     format_instructions: formatInstructions,
//     resume_text: pdfContent,
//   });

//   const response = await model.invoke([
//     new SystemMessage("You are a helpful assistant that extracts information from resumes."),
//     new HumanMessage(input)
//   ]);
//   console.log(response)
//   return parser.parse(response.content);}

// // Example usage
// async function main() {
  
//   const pdfPath = "./Profile.pdf"
//   // Step 1: Load the PDF file
//   const loader = new PDFLoader(pdfPath, { splitPages: false,parsedItemSeparator: "",
//   });
//   const docs = await loader.load();
  
//   // Combine all pages' text into a single string
//   const pdfContent = docs.map(doc => doc.pageContent).join("\n");
//   if (!pdfContent || pdfContent.trim() === '') {
//     throw new Error("The PDF content is empty or could not be extracted.");
// }
//   try {
//     const result = await processPdfContent(pdfContent);
//     console.log(JSON.stringify(result, null, 2));
//   } catch (error) {
//     console.error("Error processing PDF content:", error);
//   }
// }

// main();

// export { processPdfContent };