# Trilium Next on MicroK8s

Trilium Next is a self-hosted notes app with a web UI and persistent storage
backed by a PVC.

## Deploy

```bash
microk8s kubectl apply -k Cluster/TriliumNext
```

## Access

Add this to `/etc/hosts` on any machine that should resolve the UI:

```
192.168.1.176  trilium.local
```

Then browse:

```
http://trilium.local/
```

## Data volume

Notes and attachments are stored in `/home/node/trilium-data` inside the
container, backed by the `trilium-next-data` PVC.
