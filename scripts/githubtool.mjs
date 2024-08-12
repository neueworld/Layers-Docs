import axios from 'axios';
import dotenv from 'dotenv';
import { DynamicStructuredTool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

dotenv.config();

class GitHubDataLangChainTool {
  constructor({ owner, repo }) {
    this.owner = owner;
    this.repo = repo;
    this.type = "custom"; 
    this.baseUrl = process.env.BASE_URL;
    this.GITHUB_GRAPHQL_API_URL = 'https://api.github.com/graphql';
    this.githubToken = process.env.GT_TOKEN;
    this.queries = {
            languages: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        languages(first: 10) {
                            edges {
                                node {
                                    name
                                }
                                size
                            }
                        }
                    }
                }
            `,
            readme: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        object(expression: "main:README.md") {
                            ... on Blob {
                                text
                            }
                        }
                    }
                }
            `,
            repoTree: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        object(expression: "main:") {
                            ... on Tree {
                                entries {
                                    name
                                    type
                                }
                            }
                        }
                    }
                }
            `,
            tags: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        refs(refPrefix: "refs/tags/", first: 10) {
                            edges {
                                node {
                                    name
                                }
                            }
                        }
                    }
                }
            `,
            contributors: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        collaborators(first: 10) {
                            edges {
                                node {
                                    login
                                }
                            }
                        }
                    }
                }
            `,
            commits: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        defaultBranchRef {
                            target {
                                ... on Commit {
                                    history(first: 10) {
                                        edges {
                                            node {
                                                message
                                                committedDate
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `,
            issues: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        issues(first: 10, states: OPEN) {
                            edges {
                                node {
                                    title
                                    createdAt
                                    state
                                }
                            }
                        }
                    }
                }
            `,
            pullRequests: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        pullRequests(first: 10, states: OPEN) {
                            edges {
                                node {
                                    title
                                    createdAt
                                    state
                                }
                            }
                        }
                    }
                }
            `,
            otherFiles: `
                query($owner: String!, $repo: String!) {
                    repository(owner: $owner, name: $repo) {
                        object(expression: "main:") {
                            ... on Tree {
                                entries {
                                    name
                                    type
                                }
                            }
                        }
                    }
                }
            `
    };
  }


  async fetchRepoData(fields) {
    const data = {};
    for (const field of fields) {
      if (field === 'techStack') {
        data[field] = await this.getTechStack();
      } else {
        const query = this.queries[field]; 
        if (!query) {
          console.warn(`No query defined for field: ${field}`);
          continue;
        }

        const variables = { owner: this.owner, repo: this.repo };
        try {
          const response = await axios.post(
            this.GITHUB_GRAPHQL_API_URL,
            { query, variables },
            {
              headers: {
                Authorization: `Bearer ${this.githubToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          data[field] = response.data.data.repository;
        } catch (error) {
          console.error(`Error fetching ${field} data:`, error.response ? error.response.data : error.message);
          throw error;
        }
      }
    }
    return data;
  }

  async getTechStack(owner, repo) {
    const client = await this.createClient();
    const url = `${this.baseUrl}analyze?owner=${this.owner}&repo=${this.repo}`;
  
    try {
        const response = await client.get(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching tech stack:', error);
        throw error;
    }
    }

  async createClient() {
        const token = process.env.GT_TOKEN;
        const headers = token ? { Authorization: `${token}` } : {};
        return axios.create({ headers });
    }

  async invoke({ fields }) {
    return this.fetchRepoData(fields);
  }
}
const GitHubDataToolWrapped = new DynamicStructuredTool({
    name: "GitHubDataTool",
    description: "Fetches data from a GitHub repository",
    schema: z.object({
      fields: z.array(z.string()).describe("List of fields to fetch from the repository"),
    }),
    func: async ({ fields }) => {
      const toolInstance = new GitHubDataLangChainTool({ owner: 'neueworld', repo: 'layers' });
      return JSON.stringify(await toolInstance.fetchRepoData(fields));
    },
});

const workExperienceSchema = z.object({
    workExperience: z.array(z.object({
      company: z.string(),
      role: z.string(),
      duration: z.string(),
      location: z.string(),
      description: z.string().optional(),
    })),
    linkedInUrl: z.string().url(),
  });
  
const workExperienceTool = new DynamicStructuredTool({
    name: "extractWorkExperience",
    description: "Extracts work and experience details from text and returns structured data.",
    schema: z.object({
        promptText: z.string().describe("The prompt text for the tool"),
        pdfContent: z.string().describe("The content extracted from the PDF"),
    }),
    func: async ({ promptText, pdfContent }) => {
      // Use the OpenAI model to generate structured output based on the schema
      const model = new ChatOpenAI({ model: "gpt-4" });
      const systemTemplate = "You are given text extracted from a PDF document. Please process the following content and extract work experience and LinkedIn URL as structured data:";
      const userTemplate = "{promptText}\n\n{pdfContent}";
  
      // Step 4: Create a prompt template
      const promptTemplate = ChatPromptTemplate.fromMessages([
        ["system", systemTemplate],
        ["user", userTemplate],
      ]);
        
      const chain = promptTemplate.pipe(model);

      // Step 6: Invoke the chain with the provided data
      const result = await chain.invoke({ 
        promptText: promptText,
        pdfContent: pdfContent
      });
      const content = result.content;
      console.log(content)
      // Parse the response according to the schema
      try {
        const parsed = workExperienceSchema.parse(JSON.parse(content));
        return parsed;
      } catch (error) {
        console.error("Failed to parse response:", error);
        throw new Error("Parsing error: The response did not match the expected structure.");
      }
    },
  });
  
  export {GitHubDataToolWrapped,workExperienceTool};
  