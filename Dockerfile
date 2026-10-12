FROM python:3.12-alpine

# tzdata lets TZ=Area/City set the cinema's local time (showtimes, midnight order reset)
RUN apk add --no-cache tzdata && mkdir /data && chown 1000:1000 /data

WORKDIR /app
COPY server.py catalog.json ./
COPY static ./static
COPY data/uploads ./data/uploads

ENV LUMEN_DATA_DIR=/data \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

USER 1000:1000
VOLUME /data
EXPOSE 8000
# Python turns SIGINT into a clean shutdown, even when it runs as PID 1
STOPSIGNAL SIGINT
CMD ["python", "server.py", "--host", "0.0.0.0", "--port", "8000"]
