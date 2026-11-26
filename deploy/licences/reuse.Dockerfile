# Checks that every file of the repository says whose it is and under which licence
# (REUSE.toml, https://reuse.software). The check is the build: it fails when `reuse lint` does.
# The files come in through the build context, not a mounted folder, so it also runs where the
# Docker daemon is another machine's (a CI job's container). Without `.git` in the context the
# tool cannot ask git what is ignored: reuse.Dockerfile.dockerignore leaves out what git ignores
# and the layout engine, which is a repository of its own with its own licence files.
# Build from the repo root: deploy/licences/reuse
FROM fsfe/reuse:6.3.0
COPY . /data
# The engine again, for a builder that does not read the ignore file beside this one.
RUN rm -rf /data/packages/layout && reuse --root /data lint
