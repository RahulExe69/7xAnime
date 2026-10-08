FROM alpine:3.21

ARG PB_VERSION=0.25.9
RUN apk add --no-cache wget unzip ca-certificates python3

RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /usr/local/bin \
    && rm /tmp/pb.zip \
    && chmod +x /usr/local/bin/pocketbase

COPY entrypoint.sh init-collections.py /usr/local/bin/
RUN chmod +x /usr/local/bin/entrypoint.sh /usr/local/bin/init-collections.py

EXPOSE 8090
CMD ["/usr/local/bin/entrypoint.sh"]
