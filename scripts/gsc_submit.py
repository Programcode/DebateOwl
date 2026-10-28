#!/usr/bin/env python3
import json
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

TOKEN = Path('/home/codex/.hermes/gsc_token.json')
SITE_CANDIDATES = [
    'https://debateowl.com/',
    'sc-domain:debateowl.com',
]
SITEMAP = 'https://debateowl.com/sitemap.xml'
URLS = [
    'https://debateowl.com/',
    'https://debateowl.com/ai-debate-practice',
    'https://debateowl.com/ai-debate-case-generator',
    'https://debateowl.com/debate-rebuttal-practice',
    'https://debateowl.com/ai-debate-coach',
    'https://debateowl.com/debate-evidence-finder',
    'https://debateowl.com/argument-flowchart',
    'https://debateowl.com/online-debate-timer',
    'https://debateowl.com/how-to-write-a-debate-case',
    'https://debateowl.com/how-to-practice-rebuttals',
    'https://debateowl.com/how-to-weigh-in-debate',
    'https://debateowl.com/best-ai-debate-tools',
    'https://debateowl.com/world-schools-debate',
    'https://debateowl.com/debate-clash-points',
    'https://debateowl.com/how-to-prepare-for-a-debate-tournament',
    'https://debateowl.com/debate-speech-structure',
    'https://debateowl.com/debateowl-pricing',
    'https://debateowl.com/debateowl-vs-chatgpt',
    'https://debateowl.com/debateowl-vs-debateclub',
    'https://debateowl.com/debateowl-vs-windebate',
    'https://debateowl.com/terms',
    'https://debateowl.com/privacy',
]

def load_creds():
    data=json.loads(TOKEN.read_text())
    creds=Credentials.from_authorized_user_info(data)
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
            if 'debateowl.com' in su:
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
