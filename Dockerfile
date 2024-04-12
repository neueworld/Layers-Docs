# Start from the latest Ubuntu base image
FROM ubuntu:latest

# Install Node.js and npm
RUN apt-get update && apt-get install -y curl
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
RUN apt-get install -y nodejs

# Confirm installation
RUN node --version
RUN npm --version

# Install your application's dependencies
WORKDIR /usr/src/app
COPY package.json .
RUN npm install

# Copy your script to the container
COPY scripts/ .

# Set the command to run your application
CMD ["node", "updateData.mjs"]  # Replace 'updateData.mjs' with the actual name of your script
