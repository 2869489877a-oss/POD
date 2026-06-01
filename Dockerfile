FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1-mesa-glx libglib2.0-0 libsm6 libxext6 libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-docker.txt .
RUN pip install --no-cache-dir -r requirements-docker.txt

COPY app.py .

ENV REMBG_LOCAL_HOST=0.0.0.0
ENV REMBG_LOCAL_PORT=7860
ENV REMBG_LOCAL_OPEN_BROWSER=false
ENV REMBG_LOCAL_SHARE=false
ENV U2NET_HOME=/app/.u2net

RUN python -c "from rembg import new_session; new_session('isnet-general-use')"

EXPOSE 7860 7861

CMD ["python", "app.py"]
