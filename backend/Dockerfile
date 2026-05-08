FROM node:22-alpine

WORKDIR /app

# Install Newman globally (needed for TrackAbout API sync)
RUN npm install -g newman@6

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Create data and logs directories
RUN mkdir -p data/trackabout data/zoho logs

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "src/index.js"]
