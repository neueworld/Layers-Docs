
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
  

async function fetchRepos(username, additionalParams = {}) {
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
      return essentialFields.reduce((obj, field) => {
        obj[field] = repo[field];
        return obj;
      }, {});
    }));
    
    if (additionalParams?.language) {
      repos = repos.filter(repo => 
        repo.language && repo.language.toLowerCase() === additionalParams.language.toLowerCase()
      );
    }
  
    const reposWithDetails = await Promise.all(repos.map(async (repo) => {
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
  
  

export async function queryUserRepos(username, options = {}) {

    const db = await connectToDatabase();

    const {
      language,
      sortBy = 'stargazers_count',
      sortOrder = 'desc',
      limit,
      minStars,
      minForks,
      dateField,
      dateFrom,
      dateTo,
      keyword
    } = options;
  
    const user = await usersCollection.findOne({ username });
    if (!user) return [];
  
    let filteredRepos = user.repos;
  
    // Apply filters
    if (language) {
      filteredRepos = filteredRepos.filter(repo => repo.language === language);
    }
  
    if (minStars) {
      filteredRepos = filteredRepos.filter(repo => repo.stargazers_count >= minStars);
    }
  
    if (minForks) {
      filteredRepos = filteredRepos.filter(repo => repo.forks_count >= minForks);
    }
  
    if (dateField && (dateFrom || dateTo)) {
      filteredRepos = filteredRepos.filter(repo => {
        const repoDate = new Date(repo[dateField]);
        if (dateFrom && repoDate < new Date(dateFrom)) return false;
        if (dateTo && repoDate > new Date(dateTo)) return false;
        return true;
      });
    }
  
    if (keyword) {
      const regex = new RegExp(keyword, 'i');
      filteredRepos = filteredRepos.filter(repo => 
        regex.test(repo.name) || regex.test(repo.description)
      );
    }
  
    // Sort
    filteredRepos.sort((a, b) => {
      if (sortOrder === 'asc') {
        return a[sortBy] - b[sortBy];
      } else {
        return b[sortBy] - a[sortBy];
      }
    });
  
    // Apply limit
    if (limit) {
      filteredRepos = filteredRepos.slice(0, limit);
    }

    await client.close();
  
    return filteredRepos;
}
  
  

async function saveUserRepositories(username, repos) {
    try {
      const result = await usersCollection.updateOne(
        { username: username },
        { $set: { username: username, repos: repos } },
        { upsert: true }
      );
      if (result.upsertedCount > 0) {
        console.log(`New document created for user ${username}`);
      } else if (result.modifiedCount > 0) {
        console.log(`Document updated for user ${username}`);
      }
      console.log(`Saved ${repos.length} repositories for ${username}`);
    } catch (error) {
      console.error('Error saving user repositories:', error);
    }
  }
  
  
  
async function main(username, additionalParams = {}) {
    try {
     
    const db = await connectToDatabase();
    // const reposCollection = db.collection('repositories');

    console.log(`Fetching repositories for ${username}...`);
    // const repos = await fetchRepos(username, additionalParams);
    // console.log(`Fetched ${repos} repositories`);
    console.log(await queryUserRepos(username, {
        "sortBy": "stars",
        "sortOrder": "desc"
      }
    ));
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