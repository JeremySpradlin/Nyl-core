# Weaviate (Local)

Apply the manifests with:
- `microk8s kubectl apply -k Cluster/Weaviate`

Notes:
- Runs in the default namespace.
- Anonymous access is enabled (cluster-local use).
- Data is stored on the `weaviate-data` PVC.
