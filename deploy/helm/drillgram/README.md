# Drillgram on Kubernetes

The chart installs the hosted Drillgram image, which serves the web app and the Go API.
Use the bundled PostgreSQL 17 StatefulSet or connect Drillgram to a PostgreSQL server you manage.

## Install with bundled PostgreSQL

The bundled database uses a persistent volume. The cluster needs a default StorageClass, or you
can set `postgresql.storageClass`.

Set `DRILLGRAM_ADMIN_PASSWORD` and `POSTGRES_PASSWORD` in your shell before you run these commands.
The admin password needs at least 10 characters. Replace the example email with your own.

```sh
kubectl create namespace drillgram
kubectl -n drillgram create secret generic drillgram-admin \
  --from-literal=email=admin@example.org --from-literal=password="$DRILLGRAM_ADMIN_PASSWORD"
kubectl -n drillgram create secret generic drillgram-postgresql \
  --from-literal=password="$POSTGRES_PASSWORD"

chart=https://github.com/mafigit/drillgram/releases/download/helm-v0.1.0/drillgram-0.1.0.tgz
helm upgrade --install drillgram "$chart" -n drillgram --wait --timeout 5m
kubectl -n drillgram port-forward svc/drillgram 8080:8080
```

Open `http://localhost:8080` and sign in. Drillgram creates the first admin on an empty database.
Change the admin password in the app after bootstrap.

### Connect with psql

The bundled PostgreSQL Service is available inside the cluster. To use a local `psql` client, run
these commands in two terminals. Enter the password from the `drillgram-postgresql` Secret.

```sh
kubectl -n drillgram port-forward svc/drillgram-postgres 15432:5432
```

```sh
psql -W -h 127.0.0.1 -p 15432 -U drillgram -d drillgram
```

Helm uninstall retains the database volume claim. A reinstall with the same name, namespace
and database password reuses it. Change an existing database password in PostgreSQL before you
update the Secret and restart Drillgram.

## Install with external PostgreSQL

Create the namespace and admin Secret as in the bundled setup. Create a database and a login
that can create and update its schema. Drillgram runs the migrations at startup.

Set `DRILLGRAM_DATABASE_URL` to the connection URL. Percent-encode special characters in the
username and password. For example, this URL uses a certificate signed by a system CA.

```text
postgres://drillgram:PASSWORD@postgres.example.org:5432/drillgram?sslmode=verify-full&sslrootcert=system
```

```sh
kubectl -n drillgram create secret generic drillgram-external-db \
  --from-literal=url="$DRILLGRAM_DATABASE_URL"

chart=https://github.com/mafigit/drillgram/releases/download/helm-v0.1.0/drillgram-0.1.0.tgz
helm upgrade --install drillgram "$chart" -n drillgram --wait --timeout 5m \
  --set postgresql.enabled=false \
  --set externalDatabase.existingSecret=drillgram-external-db
```

If your database uses a private CA, create a Secret with the `ca.crt` key. Set
`externalDatabase.caSecret` to its name. Then set `sslrootcert=/etc/drillgram/db-ca/ca.crt` in the URL.

## Ingress and sign-in configuration

To serve the app on a domain, save a values file and pass it to Helm with `-f`.
The TLS Secret must exist in the release namespace.

```yaml
ingress:
  enabled: true
  className: nginx
  host: drillgram.example.org
  tlsSecret: drillgram-tls
```

The chart derives `DRILLGRAM_PUBLIC_URL` from the Ingress host and TLS settings. If a different
proxy terminates TLS, set `publicUrl` to the full public address.

Use `envFrom` to pass additional `DRILLGRAM_*` variables from a Secret or ConfigMap. This includes
OpenID Connect, proxy and JWT sign-in. See the [server environment variables](https://github.com/mafigit/drillgram/blob/main/context/operations.md#the-server).

If you use a private image registry, configure `imagePullSecrets` with a list of Kubernetes
Secret references. To use your own build, set `image.repository` and `image.tag`.

## Release

Set `version` and `appVersion` in `Chart.yaml` to the release version. From that commit on main,
push the matching `helm-v<version>` tag. GitHub Actions packages the chart and tests both
database modes on Kubernetes before publishing the image and the chart.

The chart archive appears on [GitHub Releases](https://github.com/mafigit/drillgram/releases).
GitHub Container Registry starts a new package with private visibility. Set the image package
to Public for anonymous pulls on Kubernetes. [GitHub package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility#configuring-visibility-of-a-package)
