# Nyl-core
A more cloud based version of Nyl, the assistant of the future

## JupyterLab Python Environments
The JupyterLab deployment uses the `jupyter/datascience-notebook` image. To
create a per-project virtual environment that persists across pod restarts,
place it under `/home/jovyan/work` (the PVC-backed workspace).

Example setup from a JupyterLab terminal:

```bash
cd /home/jovyan/work
python -m venv myproj/.venv
source myproj/.venv/bin/activate
pip install --upgrade pip
pip install numpy pandas scikit-learn
```

Optional: register it as a selectable Jupyter kernel:

```bash
pip install ipykernel
python -m ipykernel install --user --name myproj --display-name "Python (myproj)"
```

Then in JupyterLab: `Kernel` → `Change Kernel` → `Python (myproj)`.
