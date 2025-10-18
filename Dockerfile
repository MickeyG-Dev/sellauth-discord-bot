FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci --only=production

COPY . .

CMD ["node", "index.js"]
```

5. Click **Commit changes**

### Also Create .dockerignore

1. **Add file** → **Create new file**
2. Name it: `.dockerignore`
3. Paste:
```
node_modules
.env
.git
.gitignore
README.md
.vscode
