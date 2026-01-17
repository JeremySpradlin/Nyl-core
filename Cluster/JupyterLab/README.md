# JupyterLab on MicroK8s

Single-user JupyterLab with GPU support, a persistent work volume, and a hostPath
mount for datasets at `/home/erbun/data`.

## Before deploy

Update the token in `secret.yaml` (default is `change-me`) to something you will use.

## Deploy

```bash
microk8s kubectl apply -k Cluster/JupyterLab
```

## Access

Add this to `/etc/hosts` on any machine that should resolve the UI:

```
192.168.1.176  jupyter.local
```

Then browse:

```
http://jupyter.local/
```

## Volumes

- Notebooks: `/home/jovyan/work` (PVC)
- Datasets: `/home/jovyan/data` (hostPath to `/home/erbun/data`)
