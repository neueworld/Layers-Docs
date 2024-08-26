import { config } from "dotenv";
config()
import { Octokit } from "@octokit/rest";
import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";

export const run = async () => {
  const loader = new GithubRepoLoader(
    "https://github.com/neueworld/Proof-Engine",
    {
      branch: "main",
      recursive: true,
      processSubmodules: true,
      unknown: "warn",
      maxConcurrency: 5, // Defaults to 2
    }
  );
  const docs = await loader.load();
  console.log({ docs });
};


const octokit = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN });



export async function _fetchGitHubData(breakdown,username,relevantPaths = null) {
  const data = {};
  const maxItems = 100; // Adjust as needed

  const normalizedRequiredData = breakdown.requiredData.map(item => 
    item.toLowerCase() === 'repo' ? 'repos' : item.toLowerCase()
  );

  for (const dataType of normalizedRequiredData) {
    try {
      switch (dataType) {
        case "user":
          data.user = await fetchUserData(username);
          break;
        case "repos":
          data.repos = await fetchRepos(username, maxItems, breakdown.additionalParams);
          break;
        case "languages":
          data.languages = await fetchLanguages(username, maxItems);
          break;
        case "commits":
          data.commits = await fetchCommits(username, maxItems);
          break;
        case "pullrequests":
          data.pullRequests = await fetchPullRequests(username, maxItems);
          break;
        case "issues":
          data.issues = await fetchIssues(username, maxItems);
          break;
        case "events":
          data.events = await fetchEvents(username, maxItems);
          break;
        case "contributions":
          data.contributions = await fetchContributions(username);
          break;
        case "gists":
          data.gists = await fetchGists(username, maxItems);
          break;
        case "organizations":
          data.organizations = await fetchOrganizations(username);
          break;
          case "file_contents":
            data.file_contents = await fetchFileContents(username, relevantPaths);
            break;  
        default:
          console.warn(`Unhandled data type: ${dataType}`);
      }
    } catch (error) {
      console.error(`Error fetching ${dataType} data:`, error);
      data[dataType] = { error: error.message };
    }
  }

  return data;
}

async function fetchFileContents(username, relevantPaths) {
  const fileContents = {};

  for (const { repo, path } of relevantPaths) {
    if (!fileContents[repo]) {
      fileContents[repo] = {};
    }

    try {
      const { data } = await octokit.repos.getContent({
        owner: username,
        repo: repo,
        path: path,
      });

      if (data.type === "file") {
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        fileContents[repo][path] = {
          content: content,
          reason: relevantPaths.find(item => item.repo === repo && item.path === path).reason
        };
      } else {
        console.warn(`Skipping ${repo}/${path} as it's not a file`);
        fileContents[repo][path] = { error: "Not a file" };
      }
    } catch (error) {
      console.error(`Error fetching content for ${repo}/${path}:`, error);
      fileContents[repo][path] = { error: error.message };
    }
  }

  return fileContents;
}


async function fetchUserData(username) {
  if (!username) {
    throw new Error("Username is required for fetching user data.");
  }

  try {
    const response = await octokit.rest.users.getByUsername({ username });
    const userData = response.data;

    // Extract and return only the major data points
    return {
      login: userData.login,
      id: userData.id,
      name: userData.name,
      company: userData.company,
      blog: userData.blog,
      location: userData.location,
      email: userData.email,
      hireable: userData.hireable,
      bio: userData.bio,
      twitter_username: userData.twitter_username,
      public_repos: userData.public_repos,
      public_gists: userData.public_gists,
      followers: userData.followers,
      following: userData.following,
      created_at: userData.created_at,
      updated_at: userData.updated_at
    };
  } catch (error) {
    console.error(`Error fetching user data for ${username}:`, error);
    throw error;
  }
}

async function fetchRepos(username, maxItems, additionalParams) {
  // Define the essential fields we want to retrieve for each repo
  const essentialFields = [
    'name',
    'description',
    'html_url',
    'language',
    'stargazers_count',
    'forks_count',
    'created_at',
    'updated_at',
    'pushed_at'
  ];

  let repos = await octokit.paginate(octokit.rest.repos.listForUser, {
    username,
    per_page: 100,
    sort: 'updated',
    direction: 'desc'
  }, response => response.data.map(repo => {
    // Create a new object with only the essential fields
    return essentialFields.reduce((obj, field) => {
      obj[field] = repo[field];
      return obj;
    }, {});
  }));

  repos = repos.slice(0, maxItems);

  if (additionalParams?.language) {
    repos = repos.filter(repo => 
      repo.language && repo.language.toLowerCase() === additionalParams.language.toLowerCase()
    );
  }

  // If we need to fetch additional data that's not included in the listForUser endpoint,
  // we can do so here for each repo individually
  const reposWithDetails = await Promise.all(repos.map(async (repo) => {
    // Example: Fetching language statistics if needed
    if (additionalParams?.includeLanguageStats) {
      const languageStats = await octokit.rest.repos.listLanguages({
        owner: username,
        repo: repo.name
      });
      repo.languageStats = languageStats.data;
    }
    return repo;
  }));

  return reposWithDetails;
}


async function fetchLanguages(username, maxItems) {
  const languages = {};
  const repos = await fetchRepos(username, maxItems);
  for (const repo of repos) {
    const repoLanguages = await octokit.rest.repos.listLanguages({
      owner: username,
      repo: repo.name
    });
    Object.keys(repoLanguages.data).forEach(lang => {
      languages[lang] = (languages[lang] || 0) + 1;
    });
  }
  return languages;
}

async function fetchCommits(username, maxItems) {
  const commits = [];
  const repos = await fetchRepos(username, 5); // Limit to 5 most recent repos

  for (const repo of repos) {
    if (commits.length >= maxItems) break;

    const repoCommits = await octokit.paginate(
      octokit.rest.repos.listCommits,
      {
        owner: username,
        repo: repo.name,
        author: username,
        per_page: 100, // Increased for efficiency
        // Specify the fields we want to retrieve
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        },
        mediaType: {
          previews: ['raw-commit']
        }
      },
      (response, done) => {
        const validCommits = response.data.map(commit => ({
          sha: commit.sha,
          commit: {
            author: commit.commit.author,
            committer: commit.commit.committer,
            message: commit.commit.message
          },
          html_url: commit.html_url,
          author: {
            login: commit.author?.login,
            avatar_url: commit.author?.avatar_url
          },
          committer: {
            login: commit.committer?.login,
            avatar_url: commit.committer?.avatar_url
          }
        }));

        commits.push(...validCommits);

        if (commits.length >= maxItems) {
          done();
          return [];
        }

        return validCommits;
      }
    );

    if (commits.length >= maxItems) break;
  }

  return commits.slice(0, maxItems);
}


async function fetchPullRequests(username, maxItems) {
  return await octokit.paginate(octokit.rest.search.issuesAndPullRequests, {
    q: `is:pr author:${username}`,
    per_page: 100
  }, response => response.data.slice(0, maxItems));
}

async function fetchIssues(username, maxItems) {
  return await octokit.paginate(octokit.rest.search.issuesAndPullRequests, {
    q: `is:issue author:${username}`,
    per_page: 100
  }, response => response.data.slice(0, maxItems));
}

async function fetchEvents(username, maxItems) {
  const events = await octokit.paginate(octokit.rest.activity.listPublicEventsForUser, {
    username,
    per_page: 100
  }, response => response.data.slice(0, maxItems));
  return events.filter(event => event.type === 'PushEvent');
}

async function fetchContributions(username) {
  // This requires GraphQL API, which is not supported by Octokit REST
  // You might need to use a different method or library for this
  console.warn("Fetching contributions requires GraphQL API, not implemented in this function");
  return null;
}

async function fetchGists(username, maxItems) {
  return await octokit.paginate(octokit.rest.gists.listForUser, {
    username,
    per_page: 100
  }, response => response.data.slice(0, maxItems));
}

async function fetchOrganizations(username) {
  return await octokit.rest.orgs.listForUser({ username });
}


// module.exports = {_fetchGitHubData}