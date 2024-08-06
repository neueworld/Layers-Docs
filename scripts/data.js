const axios = require('axios');
const fs = require('fs');
require('dotenv').config();

const baseUrl = process.env.BASE_URL;
const githubToken = process.env.GT_TOKEN;

async function getTechStack(owner, repo) {
    const client = await createClient();
    const url = `${baseUrl}analyze?owner=${owner}&repo=${repo}`;
  
    try {
        const response = await client.get(url);
        return response.data;
    } catch (error) {
        console.error('Error fetching tech stack:', error);
        throw error;
    }
}

async function createClient() {
    const token = process.env.GT_TOKEN;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return axios.create({ headers });
}

async function getRepoLanguages(owner, repo) {
    const client = await createClient();
    const url = `https://api.github.com/repos/${owner}/${repo}/languages`;
  
    try {
        const response = await client.get(url);
        console.log('Languages:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error fetching repository languages:', error);
        throw error;
    }
}

async function getDefaultBranch(owner, repo) {
    const client = await createClient();
    const url = `https://api.github.com/repos/${owner}/${repo}`;
  
    try {
        const response = await client.get(url);
        return response.data.default_branch;
    } catch (error) {
        console.error('Error fetching default branch:', error);
        throw error;
    }
}
  
async function getRepoReadme(owner, repo) {
    const client = await createClient();
    let defaultBranch;
  
    try {
        defaultBranch = await getDefaultBranch(owner, repo);
    } catch (error) {
        console.error('Could not determine default branch. Trying "main" as fallback.');
        defaultBranch = 'main'; // Fallback to 'main'
    }
  
    const url = `https://api.github.com/repos/${owner}/${repo}/readme?ref=${defaultBranch}`;
  
    try {
        const response = await client.get(url);
        const readmeData = response.data;
  
        // Decode the Base64 content
        const content = Buffer.from(readmeData.content, 'base64').toString('utf-8');
        return content;
    } catch (error) {
        console.error('Error fetching repository README:', error.response ? error.response.data : error.message);
        return ''; // Return empty string in case of error
    }
}
  
async function fetchAndSaveRepoData(owner, repo) {
    try {
        const repoData = await fetchRepoData(owner, repo);
  
        const languages = repoData.languages.edges.map(edge => ({
            name: edge.node.name,
            size: edge.size,
        }));
  
        const readme = repoData.object ? repoData.object.text : '';
  
        const tags = repoData.refs.edges.map(edge => edge.node.name);
  
        const data = {
            languages,
            readme,
            tags,
        };
  
        const jsonData = JSON.stringify(data, null, 2);
        fs.writeFileSync('repoData.json', jsonData, 'utf-8');
        console.log('Data saved to repoData.json');
    } catch (error) {
        console.error('Error fetching and saving repository data:', error);
    }
}
  
async function getRepoTags(owner, repo) {
    const client = await createClient();
    const url = `https://api.github.com/repos/${owner}/${repo}/tags`;
  
    try {
        const response = await client.get(url);
        console.log('Tags:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error fetching repository tags:', error);
        throw error;
    }
}
  
const GITHUB_GRAPHQL_API_URL = 'https://api.github.com/graphql';

const queries = {
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

async function fetchRepoData(owner, repo, fields) {
    const data = {};

    for (const field of fields) {
        if (field === 'techStack') {
            data[field] = await getTechStack(owner, repo);
        } else {
            const query = queries[field];
            const variables = { owner, repo };
            try {
                const response = await axios.post(
                    GITHUB_GRAPHQL_API_URL,
                    { query, variables },
                    {
                        headers: {
                            Authorization: `Bearer ${process.env.GT_TOKEN}`,
                            'Content-Type': 'application/json',
                        },
                    }
                );
                data[field] = response.data.data.repository;
                console.log(data[field]);
            } catch (error) {
                console.error(`Error fetching ${field} data:`, error.response ? error.response.data : error.message);
                throw error;
            }
        }
    }

    return data;
}
  
async function fetchRepoBranches(owner, repo) {
    const client = await createClient();
    const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
    const response = await client.get(url);
    return response.data.map(branch => branch.name);
}

async function saveToFile(data, filename) {
    return new Promise((resolve, reject) => {
        fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf8', (err) => {
            if (err) {
                console.error('Error saving to file:', err);
                reject(err);
            } else {
                console.log('Data successfully saved to', filename);
                resolve();
            }
        });
    });
}
  
async function fetchRepoTree(owner, repo) {
    const client = await createClient();

    // Fetch branches and determine the branch to use
    const branches = await fetchRepoBranches(owner, repo);
    const branch = branches.includes('main') ? 'main' : branches.includes('master') ? 'master' : branches[0];

    // Fetch the tree using the determined branch
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const response = await client.get(url);
    let tree = response.data;

    // Filter out paths like 'node_modules' from the tree
    if (Array.isArray(tree.tree)) {
        tree.tree = tree.tree.filter(item => !item.path.includes('node_modules'));
    } else {
        throw new Error('Failed to parse the repository tree structure.');
    }

    return tree;
}
  
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const prompts = {
    "Project Showcasing": `
        Write an engaging Twitter post to showcase my latest GitHub project. Highlight the tech stack, main features, and my efforts in developing it. Avoid mentioning any third-party tools or integrations listed in the README. The post should appeal to both technical and non-technical audiences. Do not include hashtags. Character limit: 280 characters. Include the project URL at the end.
    `,
    "Project Update": `
        Write an informative Twitter post about the latest updates to my GitHub project. Highlight recent changes and their impact on the project. The post should attract both technical and non-technical audiences. Do not include hashtags. Character limit: 280 characters. Include the project URL at the end.
    `,
    "Highlight Something": `
        Create a Twitter post highlighting specific aspects of my GitHub project. Focus on the tech stack, languages used, key points from the README file, and other notable files. Make it appealing to both technical and non-technical audiences. Do not include hashtags. Character limit: 280 characters. Include the project URL at the end.
    `,
    "Achievements and Milestones": `
        Write a celebratory Twitter post highlighting the achievements and milestones of my GitHub project. Mention significant tags, key commits, and the tech stack used. The post should engage both technical and non-technical audiences. Do not include hashtags. Character limit: 280 characters. Include the project URL at the end.
    `,
    "Learn and Growth": `
        Create an insightful Twitter post highlighting the learning and growth opportunities within my GitHub project. Focus on the README file, repo structure, and key issues. Make it appealing to developers and those interested in project development. Do not include hashtags. Character limit: 280 characters. Include the project URL at the end.
    `
};

const promptMappings = {
    "Project Showcasing": ["techStack", "languages", "readme", "repoTree", "tags", "contributors"],
    "Project Update": ["commits", "issues", "pullRequests", "tags"],
    "Highlight Something": ["techStack", "languages", "readme", "repoTree", "otherFiles"],
    "Achievements and Milestones": ["tags", "commits", "techStack"],
    "Learn and Growth": ["readme", "repoTree", "issues"]
};
  
async function getOpenAIResponse(prompt, data) {
    try {
        const response = await axios.post(
            OPENAI_API_URL,
            {
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a writer for a developer forum.'
                    },
                    {
                        role: 'user',
                        content: `${prompt}\n\nData:\n${JSON.stringify(data, null, 2)}`
                    }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
  
        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error fetching OpenAI response:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function fetchAndSendRepoDataToOpenAI(owner, repo, selectedPromptKey) {
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
        const response = await getOpenAIResponse(prompt, data);
        console.log('OpenAI Response:', response);
    } catch (error) {
        console.error('Error fetching and sending repository data to OpenAI:', error);
    }
}
  
// Usage example
(async () => {
    try {
        const owner = 'amCap1712';
        const repo = 'metabrainz.org';
        let selectedPromptKey = "Project Showcasing";
        console.log("selected prompt:", selectedPromptKey);
        await fetchAndSendRepoDataToOpenAI(owner, repo, selectedPromptKey);
    } catch (error) {
        console.error('Error fetching repository tree:', error.message);
    }
})();
