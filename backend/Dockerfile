# TeamUp 后端镜像：Node.js + Express + better-sqlite3
# 使用完整版 node 镜像（自带构建工具链），确保 better-sqlite3 在无预编译产物时可本地编译。
FROM node:20

WORKDIR /app

# 先装依赖，利用 Docker 层缓存
COPY package.json ./
RUN npm install --omit=dev

# 拷贝源码
COPY . .

# SQLite 数据库固定放在 /app/data（docker-compose 会把 ./backend/data 挂载到这里）
ENV DATA_DIR=/app/data
RUN mkdir -p /app/data

EXPOSE 3001

CMD ["node", "server.js"]
