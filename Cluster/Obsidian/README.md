# Obsidian Deployment for Nyl-Core

Browser-based Obsidian vault server running in microk8s.

## Deployment

Deploy to your cluster:

```bash
kubectl apply -k ~/Dev/Nyl-core/Cluster/Obsidian/
```

Verify deployment:

```bash
kubectl get pods -n obsidian
kubectl get svc -n obsidian
kubectl get ingress -n obsidian
```

## Access

Once deployed and ingress is active, access via:

```
http://obsidian.local
```

(Requires DNS/local network proxy configured for `obsidian.local` to route to your k8s ingress IP)

## Configuration

- **Storage:** 10Gi PVC for vault persistence
- **Port:** 3000 (internal) → 80 (service)
- **Timezone:** America/New_York
- **Image:** linuxserver/obsidian:latest

## Vault Location

Vault files persist at `/config/vaults/` in the PVC. Claude Code can write directly to this path for article drafts.

## Notes

- Initial setup may take 60-90 seconds for container to boot
- First access will require Obsidian vault initialization
- Vault is readable/writable from any machine on your local network

## Cleanup

To remove:

```bash
kubectl delete -k ~/Dev/Nyl-core/Cluster/Obsidian/
```
