# Repository Guidelines

## Project Structure & Module Organization
This repository is a set of Kubernetes manifests for running Nyl-core services on
MicroK8s. The main entry point is `Cluster/`, which contains per-service
directories:
- `Cluster/JupyterLab/`: JupyterLab deployment, PVC, service, ingress, and
  kustomization.
- `Cluster/Ollama/`: Ollama deployment, PVC, service, ingress, models ConfigMap,
  and pull-models Job.
- `Cluster/WebUI/`: Open WebUI deployment, PVC, service, ingress, and
  kustomization.

Each service folder is a standalone kustomize package with its own
`kustomization.yaml`. There is no application source code or test suite here.

## Build, Test, and Development Commands
Use MicroK8s to apply manifests:
- `microk8s kubectl apply -k Cluster/JupyterLab` deploys JupyterLab.
- `microk8s kubectl apply -k Cluster/Ollama` deploys Ollama.
- `microk8s kubectl apply -k Cluster/WebUI` deploys Open WebUI.

Operational examples:
- Update JupyterLab access token in `Cluster/JupyterLab/secret.yaml`.
- Re-run the model pre-pull Job:
  `microk8s kubectl delete job ollama-pull-models` then
  `microk8s kubectl apply -f Cluster/Ollama/pull-models-job.yaml`.

## Coding Style & Naming Conventions
- YAML files use 2-space indentation; keep this consistent.
- Use Kubernetes naming patterns: lowercase, hyphenated resource names (e.g.,
  `ollama-pull-models`).
- Keep kustomize resources listed explicitly in each `kustomization.yaml`.

## Testing Guidelines
There are no automated tests in this repository. Validate changes by applying
manifests to a MicroK8s cluster and checking service readiness and ingress
access.

## Commit & Pull Request Guidelines
Git history does not establish a convention yet. Use concise, imperative commit
messages (e.g., "Add Ollama ingress"). For PRs, include:
- A short description of what changed and why.
- Links to related issues or tickets if applicable.
- Any manual verification steps (kubectl commands, URLs, or screenshots).

## Configuration & Access Notes
- Ingress hostnames assume local `/etc/hosts` mappings as described in each
  service README (e.g., `ollama.local`, `webui.ollama.local`).
- PVCs and hostPath mounts are defined per service; review paths before
  deployment, especially the dataset hostPath in JupyterLab.
