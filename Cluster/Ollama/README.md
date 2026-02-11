# Ollama on MicroK8s

This setup deploys a single Ollama pod with GPU support, persistent model storage,
and an Ingress at `ollama.local`.

## Deploy

```bash
microk8s kubectl apply -k Cluster/Ollama
```

## Access

Add this to `/etc/hosts` on any machine that should resolve the service:

```
192.168.1.176  ollama.local
```

Then browse or call the API at:

```
http://ollama.local/
```
