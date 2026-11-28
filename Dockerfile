FROM node:22-slim
# fonts: calendar images and clip text. ffmpeg: clip rendering. python + faster-whisper: captions.
RUN apt-get update && apt-get install -y --no-install-recommends \
      fontconfig fonts-dejavu-core ffmpeg python3 python3-venv ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m venv /opt/whisper \
    && /opt/whisper/bin/pip install --no-cache-dir faster-whisper
ENV WHISPER_PYTHON=/opt/whisper/bin/python \
    HF_HOME=/models
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
CMD ["node", "src/index.js"]
