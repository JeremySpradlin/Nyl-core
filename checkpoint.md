# Checkpoint

## What we set up
- Ollama on MicroK8s in default namespace with GPU, PVC, Ingress `ollama.local`, and model pre-pull Job.
- Open WebUI in `Cluster/WebUI` with Ingress `webui.ollama.local`, wired to `http://ollama:11434`.
- JupyterLab in `Cluster/JupyterLab` with GPU access, PVC for notebooks, hostPath datasets at `/home/erbun/data`, Ingress `jupyter.local`, and token auth via Secret.

## Files added/updated
- `Cluster/Ollama/*` (default namespace): `deployment.yaml`, `service.yaml`, `ingress.yaml`, `pvc.yaml`, `models-configmap.yaml`, `pull-models-job.yaml`, `kustomization.yaml`, `README.md`.
- `Cluster/WebUI/*`: `deployment.yaml`, `service.yaml`, `ingress.yaml`, `pvc.yaml`, `kustomization.yaml`, `README.md`.
- `Cluster/JupyterLab/*`: `deployment.yaml`, `service.yaml`, `ingress.yaml`, `pvc.yaml`, `secret.yaml`, `kustomization.yaml`, `README.md`.
- `checkpoint.md` (this file).

## Key runtime actions performed
- Created host dataset dir and ownership:
  - `mkdir -p /home/erbun/data`
  - `chown 1000:1000 /home/erbun/data`
- Enabled GPU time-slicing (3 slices):
  - ConfigMap `time-slicing-config` in `gpu-operator-resources`
  - Patched ClusterPolicy to use it
  - Restarted `nvidia-device-plugin-daemonset`
  - Verified node reports `nvidia.com/gpu: 3`

## Access/hosts entries
- `/etc/hosts`:
  - `192.168.1.176  ollama.local`
  - `192.168.1.176  webui.ollama.local`
  - `192.168.1.176  jupyter.local`

## Current expectations
- Pods should now schedule with GPU slices (Ollama + Jupyter + another).
- If any pod is Pending, deleting it should reschedule with new GPU capacity:
  - `microk8s kubectl delete pod -l app=jupyterlab`

## Notes/todos
- Update Jupyter token in `Cluster/JupyterLab/secret.yaml` (default `change-me`).
- Apply manifests as needed:
  - `microk8s kubectl apply -k Cluster/Ollama`
  - `microk8s kubectl apply -k Cluster/WebUI`
  - `microk8s kubectl apply -k Cluster/JupyterLab`
