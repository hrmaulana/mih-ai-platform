FROM nginx:alpine
# Skip npm install — gunakan prebuilt dist dari host (build lokal)
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf