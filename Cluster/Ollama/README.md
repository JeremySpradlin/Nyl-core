# Ollama on MicroK8s

This setup deploys a single Ollama pod with GPU support, persistent model storage,
an Ingress at `ollama.local`, and a one-shot Job to pre-pull a few models.

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

## Model pre-pull

The Job `ollama-pull-models` calls the Ollama API to pull models listed in
`models-configmap.yaml`. If you update the list, delete and re-run the Job:

```bash
microk8s kubectl delete job ollama-pull-models
microk8s kubectl apply -f Cluster/Ollama/pull-models-job.yaml
```
