{{- define "drillgram.postgresqlName" -}}
{{- printf "%s-postgres" .Release.Name -}}
{{- end -}}

{{- define "drillgram.appSelector" -}}
app.kubernetes.io/name: drillgram
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: app
{{- end -}}

{{- define "drillgram.postgresqlSelector" -}}
app.kubernetes.io/name: drillgram
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: postgresql
{{- end -}}
