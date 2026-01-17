# Open WebUI on MicroK8s

This deploys Open WebUI and connects it to the Ollama service at
`http://ollama:11434` inside the cluster.

## Deploy

```bash
microk8s kubectl apply -k Cluster/WebUI
```

## Access

Add this to `/etc/hosts` on any machine that should resolve the UI:

```
192.168.1.176  webui.ollama.local
```

Then browse:

```
http://webui.ollama.local/
```
