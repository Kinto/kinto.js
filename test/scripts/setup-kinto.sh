#!/usr/bin/env bash

if curl -s -I http://0.0.0.0:9999/v1/ |grep "200 OK" > /dev/null; then
  echo "A Kinto instance is already running on port 9999, exiting."
  exit 1
fi

REPO_ROOT=`pwd`
KINTO_ROOT=/var/tmp/kinto
KINTO_RELEASE=1.2.0

git clone https://github.com/mozilla-services/kinto.git $KINTO_ROOT
cd $KINTO_ROOT
git checkout $KINTO_RELEASE
cp $REPO_ROOT/test/scripts/kinto.ini $KINTO_ROOT/config/kinto.ini

make serve &
