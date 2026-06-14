# Coletor Crypto Monitor — imagem para Railway/Render (worker contínuo).
# Contexto de build = raiz do repositório (ver render.yaml / railway.json).
FROM python:3.12-slim

WORKDIR /app

# Dependências primeiro (cache de camada)
COPY collector/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Código do coletor
COPY collector/ ./

# As variáveis (SUPABASE_*, COINALYZE_API_KEY, ...) vêm do host, não de um .env.
ENV PYTHONUNBUFFERED=1
CMD ["python", "aggregator.py"]
