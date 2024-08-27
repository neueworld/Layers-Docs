
import { config } from "dotenv";
config()
import { MongoClient } from 'mongodb';
import { Octokit } from "@octokit/rest";

const uri = process.env.MONGO_URI;
const octokit = new Octokit({ auth: process.env.GITHUB_ACCESS_TOKEN });

const client = new MongoClient(uri);

let usersCollection;

async function connectToDatabase() {
    await client.connect();
    const db = client.db('layers-ajay');
    usersCollection = db.collection('github_users');
    await usersCollection.createIndex({ username: 1 }, { unique: true });
  }
  
async function fetchLanguages(username) {
    const aggregatedLanguages = {};
    const repoLanguages = {};
    const repos = await fetchRepos(username);
  
    for (const repo of repos) {
      const langResponse = await octokit.rest.repos.listLanguages({
        owner: username,
        repo: repo.name
      });
  
      repoLanguages[repo.name] = langResponse.data;
  
      Object.entries(langResponse.data).forEach(([lang, lines]) => {
        if (aggregatedLanguages[lang]) {
          aggregatedLanguages[lang].count++;
          aggregatedLanguages[lang].lines += lines;
        } else {
          aggregatedLanguages[lang] = { count: 1, lines: lines };
        }
      });
    }
  
    return {
      repoLanguages: repoLanguages,
      aggregatedLanguages: aggregatedLanguages
    };
  }
  
export async function queryUserRepos(username, options = {}) {
    const db = await connectToDatabase();
  
    const {
      languages = [],
      sortBy = 'stargazers_count',
      sortOrder = 'desc',
      limit,
      minStars = 0,
      minForks = 0,
      dateField,
      dateFrom,
      dateTo,
      keyword,
      minLanguageLines = {}
    } = options;
  
    const user = await usersCollection.findOne({ username });
    if (!user) return [];
  
    const languageSet = new Set(languages);
    console.log("languageSet : ",languageSet)
    const dateFromObj = dateFrom ? new Date(dateFrom) : null;
    const dateToObj = dateTo ? new Date(dateTo) : null;
    const keywordRegex = keyword ? new RegExp(keyword, 'i') : null;
  
    const filteredRepos = user.repos.filter(repo => {
      // Language filter
      if (languageSet.size > 0 && !languageSet.has(repo.language)) {
        return false;
      }
  
      // Stars and forks filter
      if (repo.stargazers_count < minStars || repo.forks_count < minForks) {
        return false;
      }
  
      // Date filter
      if (dateField && (dateFromObj || dateToObj)) {
        const repoDate = new Date(repo[dateField]);
        if ((dateFromObj && repoDate < dateFromObj) || (dateToObj && repoDate > dateToObj)) {
          return false;
        }
      }
  
      // Keyword filter
      if (keywordRegex && !(keywordRegex.test(repo.name) || keywordRegex.test(repo.description))) {
        return false;
      }
  
      // Language lines filter
      if (Object.keys(minLanguageLines).length > 0) {
        console.log("language lines filter")
        for (const [lang, minLines] of Object.entries(minLanguageLines)) {
          if ((repo.languages[lang] || 0) < minLines) {
            return false;
          }
        }
      }
  
      return true;
    });
  
    // console.log("filtered Repos : ",filteredRepos)
    // Sort
    const sortedRepos = filteredRepos.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
  
      if (sortBy.startsWith('languages.')) {
        const lang = sortBy.split('.')[1];
        aValue = a.languages[lang] || 0;
        bValue = b.languages[lang] || 0;
      }
  
      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });
  
    // Apply limit
    const limitedRepos = limit ? sortedRepos.slice(0, limit) : sortedRepos;
  
    await client.close();
  
    return limitedRepos;
}

// export async function queryUserRepos(username, options = {}) {
//   const db = await connectToDatabase();

//   const {
//     languages = [],
//     sortBy = 'stargazers_count',
//     sortOrder = 'desc',
//     limit,
//     minStars = 0,
//     minForks = 0,
//     dateField,
//     dateFrom,
//     dateTo,
//     keyword,
//     minLanguageLines = {},
//     files = [],
//     extensions = []
//   } = options;

//   const pipeline = [
//     { $match: { username: username } },
//     { $unwind: "$repos" },
//     {
//       $match: {
//         $and: [
//           languages.length > 0 ? { "repos.language": { $in: languages } } : {},
//           { "repos.stargazers_count": { $gte: minStars } },
//           { "repos.forks_count": { $gte: minForks } },
//           dateField && dateFrom ? { [`repos.${dateField}`]: { $gte: new Date(dateFrom) } } : {},
//           dateField && dateTo ? { [`repos.${dateField}`]: { $lte: new Date(dateTo) } } : {},
//           keyword ? {
//             $or: [
//               { "repos.name": { $regex: keyword, $options: "i" } },
//               { "repos.description": { $regex: keyword, $options: "i" } }
//             ]
//           } : {},
//           ...Object.entries(minLanguageLines).map(([lang, minLines]) => ({
//             [`repos.languages.${lang}`]: { $gte: minLines }
//           })),
//           files.length > 0 || extensions.length > 0 ? {
//             $or: [
//               { "repos.fileTree": { $in: files.map(file => new RegExp(`(^|/)${file}$`, 'i')) } },
//               { "repos.fileTree": { $in: extensions.map(ext => new RegExp(`\\.${ext}$`, 'i')) } }
//             ]
//           } : {}
//         ].filter(condition => Object.keys(condition).length > 0)
//       }
//     },
//     {
//       $sort: {
//         [`repos.${sortBy}`]: sortOrder === 'asc' ? 1 : -1
//       }
//     },
//     {
//       $group: {
//         _id: "$_id",
//         repos: { $push: "$repos" }
//       }
//     },
//     {
//       $project: {
//         _id: 0,
//         repos: 1
//       }
//     }
//   ];

//   if (limit) {
//     pipeline.push({ $limit: limit });
//   }

//   const result = await usersCollection.aggregate(pipeline).toArray();
  
//   await client.close();

//   return result.length > 0 ? result[0].repos : [];
// }
  
async function fetchReposWithLanguages(username) {
  const repos = [];
  const aggregatedLanguages = {};

  for await (const response of octokit.paginate.iterator(octokit.rest.repos.listForUser, {
    username,
    per_page: 100,
    sort: 'updated',
    direction: 'desc'
  })) {
    for (const repo of response.data) {
      const repoLanguages = await octokit.rest.repos.listLanguages({
        owner: username,
        repo: repo.name
      });

      const repoData = {
        name: repo.name,
        description: repo.description,
        html_url: repo.html_url,
        language: repo.language,
        stargazers_count: repo.stargazers_count,
        forks_count: repo.forks_count,
        created_at: repo.created_at,
        updated_at: repo.updated_at,
        pushed_at: repo.pushed_at,
        languages: repoLanguages.data
      };

      repos.push(repoData);

      // Update aggregatedLanguages
      Object.entries(repoLanguages.data).forEach(([lang, lines]) => {
        if (aggregatedLanguages[lang]) {
          aggregatedLanguages[lang].count++;
          aggregatedLanguages[lang].lines += lines;
        } else {
          aggregatedLanguages[lang] = { count: 1, lines: lines };
        }
      });
    }
  }

  return { repos, aggregatedLanguages };
}

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

async function saveUserRepositories(username, data) {
  try {
    const result = await usersCollection.updateOne(
      { username: username },
      { 
        $set: { 
          username: username, 
          repos: data.repos.map(repo => ({
            ...repo,
            fileTree: data.repoTrees[repo.name] || []
          })),
          languages: data.aggregatedLanguages
        } 
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) {
      console.log(`New document created for user ${username}`);
    } else if (result.modifiedCount > 0) {
      console.log(`Document updated for user ${username}`);
    }
    console.log(`Saved ${data.repos.length} repositories for ${username}`);
  } catch (error) {
    console.error('Error saving user repositories:', error);
  }
}
  
async function main(username, additionalParams = {}) {
    try {
     
    const db = await connectToDatabase();
    // const reposCollection = db.collection('repositories');

    // const repos = await fetchRepos(username, additionalParams);
    // console.log(`Fetched ${repos} repositories`);
    console.log(await queryUserRepos(username, {
      languages: ['Solidity', 'Rust'],
      minLanguageLines: { 
        $or: [
          { Solidity: 1 },
          { Rust: 1 }
        ]
      }
      }))
    // console.log("Inserting repositories into the database...");
    // await saveUserRepositories(username,repos);
  
    console.log("Process completed successfully");
    } catch (error) {
      console.error("An error occurred:", error);
    } finally {
      await client.close();
      console.log("Database connection closed");
    }
}

// main("aduttya")  