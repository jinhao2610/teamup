# TeamUp 前端镜像：Vite 构建 + vite preview 静态服务（端口 3000）
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "preview"]
