#!/usr/bin/env python3
import json
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

TOKEN = Path('/home/codex/.hermes/gsc_token.json')
SITE_CANDIDATES = [
    'https://debate.pi-stack.org/',
    'sc-domain:pi-stack.org',
]
SITEMAP = 'https://debate.pi-stack.org/sitemap.xml'
URLS = [
    'https://debate.pi-stack.org/',
    'https://debate.pi-stack.org/ai-debate-practice',
    'https://debate.pi-stack.org/debate-case-generator',
    'https://debate.pi-stack.org/debate-rebuttal-practice',
    'https://debate.pi-stack.org/ai-debate-coach',
    'https://debate.pi-stack.org/debate-evidence-finder',
    'https://debate.pi-stack.org/argument-flowchart',
    'https://debate.pi-stack.org/online-debate-timer',
    'https://debate.pi-stack.org/how-to-write-a-debate-case',
    'https://debate.pi-stack.org/how-to-practice-rebuttals',
    'https://debate.pi-stack.org/debate-weighing-guide',
    'https://debate.pi-stack.org/ai-tools-for-debate-students',
    'https://debate.pi-stack.org/wsdc-debate-practice',
    'https://debate.pi-stack.org/about-debatelab',
    'https://debate.pi-stack.org/terms',
    'https://debate.pi-stack.org/privacy',
]

def load_creds():
    data=json.loads(TOKEN.read_text())
    creds=Credentials(
        token=data.get('token'),
        refresh_token=data.get('refresh_token'),
        token_uri=data.get('token_uri'),
        client_id=data.get('client_id'),
        client_secret=data.get('client_secret'),
        scopes=data.get('scopes'),
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        data['token']=creds.token
        if creds.expiry:
            data['expiry']=creds.expiry.isoformat()
        TOKEN.write_text(json.dumps(data, indent=2))
        TOKEN.chmod(0o600)
    return creds

def main():
    service=build('searchconsole','v1',credentials=load_creds(),cache_discovery=False)
    sites=service.sites().list().execute().get('siteEntry', [])
    print('SITES')
    print(json.dumps(sites, indent=2))
    site_url=None
    for cand in SITE_CANDIDATES:
        if any(s.get('siteUrl') == cand for s in sites):
            site_url=cand
            break
    if not site_url:
        # Try any property that can cover target.
        for s in sites:
            su=s.get('siteUrl','')
            if 'pi-stack.org' in su or 'debate.pi-stack.org' in su:
                site_url=su
                break
    if not site_url:
        raise SystemExit('NO_MATCHING_PROPERTY')
    print('USING_SITE', site_url)

    print('SUBMIT_SITEMAP', SITEMAP)
    try:
        service.sitemaps().submit(siteUrl=site_url, feedpath=SITEMAP).execute()
        print('SITEMAP_SUBMIT_OK')
    except HttpError as e:
        print('SITEMAP_SUBMIT_ERROR', e.status_code, e.reason, e.content.decode('utf-8','ignore')[:1000])

    print('SITEMAPS')
    try:
        print(json.dumps(service.sitemaps().list(siteUrl=site_url).execute(), indent=2)[:5000])
    except HttpError as e:
        print('SITEMAPS_LIST_ERROR', e.status_code, e.reason, e.content.decode('utf-8','ignore')[:1000])

    print('URL_INSPECTION')
    inspect=build('searchconsole','v1',credentials=load_creds(),cache_discovery=False).urlInspection().index().inspect
    for u in URLS:
        try:
            res=inspect(body={'inspectionUrl':u,'siteUrl':site_url}).execute()
            idx=res.get('inspectionResult',{}).get('indexStatusResult',{})
            print(json.dumps({'url':u,'verdict':idx.get('verdict'),'coverageState':idx.get('coverageState'),'robotsTxtState':idx.get('robotsTxtState'),'indexingState':idx.get('indexingState'),'lastCrawlTime':idx.get('lastCrawlTime'),'pageFetchState':idx.get('pageFetchState'),'googleCanonical':idx.get('googleCanonical'),'userCanonical':idx.get('userCanonical')}, indent=2))
        except HttpError as e:
            print(json.dumps({'url':u,'error_status':e.status_code,'reason':e.reason,'body':e.content.decode('utf-8','ignore')[:500]}, indent=2))

if __name__ == '__main__':
    main()
