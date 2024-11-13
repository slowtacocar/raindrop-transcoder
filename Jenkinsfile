pipeline {
  agent {
    kubernetes {
      yaml '''
        apiVersion: v1
        kind: Pod
        spec:
          securityContext:
            runAsUser: 0
          serviceAccountName: jenkins-agent
          containers:
          - name: docker
            image: docker:27.2-dind
            volumeMounts:
            - name: cert-volume
              mountPath: /etc/ssl/certs
              readOnly: true
            securityContext:
              privileged: true
          - name: kubectl
            image: bitnami/kubectl:1.27
            command:
            - cat
            tty: true
          volumes:
          - name: cert-volume
            hostPath:
              path: /etc/ssl/certs
              type: Directory
        '''
    }
  }

  environment {
    HARBOR = credentials('harbor')
  }

  stages {
    stage('Build') {
      steps {
        container('docker') {
          sh 'docker login cme-harbor.int.bobbygeorge.dev -u $HARBOR_USR -p $HARBOR_PSW'
          sh 'docker build -t raindrop-transcoder --cache-to type=inline --cache-from type=registry,ref=cme-harbor.int.bobbygeorge.dev/raindrop/raindrop-transcoder:$GIT_BRANCH --cache-from type=registry,ref=cme-harbor.int.bobbygeorge.dev/raindrop/raindrop-transcoder:latest .'
          sh '! [ "$GIT_BRANCH" = "master" ] || docker tag raindrop-transcoder cme-harbor.int.bobbygeorge.dev/raindrop/raindrop-transcoder:latest'
          sh 'docker tag raindrop-transcoder cme-harbor.int.bobbygeorge.dev/raindrop/raindrop-transcoder:$GIT_BRANCH'
          sh 'docker tag raindrop-transcoder cme-harbor.int.bobbygeorge.dev/raindrop/raindrop-transcoder:$GIT_COMMIT'
          sh 'docker push -a cme-harbor.int.bobbygeorge.dev/raindrop/raindrop-transcoder'
        }
      }
    }

    stage('Deploy Preview') {
      when {
        not {
          branch 'master'
        }
      }
      steps {
        container('kubectl') {
          sh 'ENV=dev TAG=$GIT_COMMIT NAMESPACE=raindrop-preview PREFIX=raindrop-$(echo "$GIT_BRANCH" | tr \'[:upper:]\' \'[:lower:]\' | sed \'s/[^a-z0-9.-]//g\') envsubst \'$TAG:$NAMESPACE:$ENV:$PREFIX\' < kubernetes.yaml | kubectl apply -f -'
        }
      }
    }
    stage('Deploy Prod') {
      when {
        branch 'master'
      }
      steps {
        container('kubectl') {
          sh 'ENV=prod TAG=$GIT_COMMIT NAMESPACE=raindrop PREFIX=raindrop envsubst \'$TAG:$NAMESPACE:$ENV:$PREFIX\' < kubernetes.yaml | kubectl apply -f -'
        }
      }
    }
  }
}
