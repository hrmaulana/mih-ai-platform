# Frontend assets are built in CI and transferred to deploy runners as an
# artifact. Production image assembly must not download npm dependencies on VPS.
FROM nginx:alpine
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
