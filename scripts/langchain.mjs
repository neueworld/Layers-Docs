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
import {GitHubDataToolWrapped,workExperienceTool} from './githubtool.mjs'; 
import { createOpenAIFunctionsAgent,AgentExecutor} from "langchain/agents";


const model = new ChatOpenAI({ model: "gpt-4" });
const parser = new StringOutputParser();

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

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
      const fields = promptMappings[selectedPromptKey];
      const repoData = await fetchRepoData(owner, repo, fields);
      
      if (fields.includes('techStack')) {
          repoData.techStack = await getTechStack(owner, repo);
      }
  
      const data = {
          url: `https://github.com/${owner}/${repo}`,
          ...repoData
      };
      

    const prompt = prompts[selectedPromptKey];
    const systemTemplate = "Generate content based on the following data:";
    const userTemplate = "{prompt}\n\n{data}";
    const promptTemplate = ChatPromptTemplate.fromMessages([
      ["system", prompt],
      ["user", userTemplate],
    ]);

    const chain = promptTemplate.pipe(model).pipe(parser);
    const result = await chain.invoke({ 
      prompt: prompt,
      data: JSON.stringify(data, null, 2)
    
    });
    // const result = await promptTemplate.invoke({ data: JSON.stringify(data, null, 2) });
    console.log("The result from chain : ",result);

    // This is the agent code
    // if (result) {
    //   const agentFinalState = await agent.invoke(
    //     { messages: [new HumanMessage(result)] },  
    //     { configurable: { thread_id: "42" } }
    //   );

    //   console.log("agentFinalState : ",agentFinalState)
    //   console.log(
    //     agentFinalState.messages[agentFinalState.messages.length - 1].content,
    //   );

    //   const agentNextState = await agent.invoke(
    //     { messages: [new HumanMessage("Can you summarize this in a tweet?")] },
    //     { configurable: { thread_id: "42" } }
    //   );

    //   console.log(
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


// (async () => {
    



//       const pdfPath = "./Profile.pdf"; 
//       const promptText = "Filter the work and experience from the given file. add the linkedin url too.";
//       await processPdfAndGenerateContent(pdfPath, promptText);
      
//       const owner = 'neueworld';
//       const repo = 'layers';
//       // const githubDataTool = new ({ owner: owner, repo: repo });
//       const selectedCategory = "Project Showcasing"; 

//       // const fields = promptMappings[selectedCategory]
      
//       // try {
//       //   const data = await githubDataTool.fetchRepoData(fields);
//       //   console.log("Fetched GitHub Data:", data);
//       // } catch (error) {
//       //   console.error("Error during GitHub data fetching:", error);
//       // }
    
//       // await fetchAndSendRepoData(owner,repo,selectedCategory)

//   })();
  

// const result = await model.invoke(messages);
// const answer = await parser.invoke(result)
// console.log(answer)


import { z } from "zod";
import { StructuredOutputParser } from "langchain/output_parsers";

// Define the struct using Zod schema
const resumeSchema = z.object({
  name: z.string(),
  email: z.string().email(),
  linkedIn: z.string().url(),
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(z.object({
    company: z.string(),
    position: z.string(),
    duration: z.string(),
    description: z.string().optional(),
  })),
  education: z.array(z.object({
    institution: z.string(),
    degree: z.string(),
    field: z.string(),
    year: z.string(),
  })),
});

// Create the output parser
// const parser = StructuredOutputParser.fromZodSchema(resumeSchema);


// Create a prompt template
const prompt = PromptTemplate.fromTemplate(`
  Extract the following information from the given resume text. If a piece of information is not present, use null or an empty array as appropriate.
  
  {format_instructions}
  
  Resume text:
  {resume_text}
  `);

// Function to process PDF content
async function processPdfContent(pdfContent) {
  const formatInstructions = parser.getFormatInstructions();

  const input = await prompt.format({
    format_instructions: formatInstructions,
    resume_text: pdfContent,
  });

  const response = await model.invoke([
    new SystemMessage("You are a helpful assistant that extracts information from resumes."),
    new HumanMessage(input)
  ]);
  console.log(response)
  return parser.parse(response.content);}

// Example usage
async function main() {
  
  const pdfPath = "./Profile.pdf"
  // Step 1: Load the PDF file
  const loader = new PDFLoader(pdfPath, { splitPages: false,parsedItemSeparator: "",
  });
  const docs = await loader.load();
  
  // Combine all pages' text into a single string
  const pdfContent = docs.map(doc => doc.pageContent).join("\n");
  if (!pdfContent || pdfContent.trim() === '') {
    throw new Error("The PDF content is empty or could not be extracted.");
}
  try {
    const result = await processPdfContent(pdfContent);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error processing PDF content:", error);
  }
}

main();

export { processPdfContent };