FROM ubuntu:24.04

# ── Build tools + Google Test ───────────────────────────────────────────────
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    g++ cmake libgtest-dev libgmock-dev \
 && cd /usr/src/gtest \
 && cmake . \
 && make \
 && cp lib/*.a /usr/lib/ \
 && rm -rf /var/lib/apt/lists/*

# No CMD — supplied at docker run time via sandbox.py.
# Outbound network is disabled at runtime via --network none.
