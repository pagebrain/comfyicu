# Comfy.ICU
Imgur for sharing [ComfyUI](https://github.com/comfyanonymous/ComfyUI) workflows.

Uses [CloudFlare R2](https://www.cloudflare.com/developer-platform/r2/) for storage, please update the credentials in `.env` and `k8s.yml`.

Uses [imgproxy](https://github.com/imgproxy/imgproxy) for dynamic image resizing.

## Getting Started

To run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.


## Deploying on Kubernetes

```bash
skaffold run
# or
kubectl apply -f k8s.yml
kubectl apply -f proxy.yml
```