FROM node:22-alpine AS build
WORKDIR /app
# bust: camera-browser-v3
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "sed -i \"s/listen 8080/listen ${PORT}/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
