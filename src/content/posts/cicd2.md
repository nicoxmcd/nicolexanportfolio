---
title: CI/CD - QA Automated Unit Tests
published: 2025-07-01
description: "Working across teams to reduce time for QA team unit testing."
image: ""
tags: ["Project", "DevOps", "CI/CD"]
category: DevOps Projects
draft: false
---

## Overview
Our QA team has unit tests that they wanted to run everyday to verify usability and consistency on new deployments. There were several unit tests, so these were taking several hours to run, we reduced it to a couple of hours through the use of a matrix strategy. However, these tests were expected to take a very long time to run due to the depth of the testing.

## Walkthrough
To kickoff the workflow, it can be manually triggered via a workflow dispatch AND it is triggered daily on a specific testing environment to test the latest changes that were automatically deployed. The schedule also helps to address things that could change overnight either because of a VM issue or perhaps a deprecated action as part of the build process.
```yml
name: Unit Tests

on:
    workflow_dispatch:
    push:
        schedule:
            - cron: "0 1 * * *"
```

This first job ingests a json file with the testing information needed for the rest of the workflow. Saving it as a GitHub output allows it to be used across jobs.  
```yml
jobs:
    get-tests:
        runs-on: ubuntu-latest
        outputs:
            test: ${{ steps.json.outputs.tests }}
        steps:
            - uses: actions/actions@latest
            - name: Get Tests & HTML Title
              id: json
              shell: bash
              run: echo "test=`jq '.' -c test-manifest.json`" >> $GITHUB_OUTPUT
```

As I demonstrated in a previous post, you can create a json file with number variables to create a matrix strategy in a later job. In this instance, we are using it to specify a specific method of unit testing along with the desired output name for the HTML report. 
`test-manifest.json`
```json
[
    {
        "testName": "A",
        "htmlTitle": "TitleA.html"
    },
    {
        "testName": "B",
        "htmlTitle": "TitleB.html"
    },
    {
        "testName": "C",
        "htmlTitle": "TitleC.html"
    }
]
```
At this point, you can configure the testing job with a matrix strategy and write the tests or reference the test's testing source code if necessary. For privacy's sake, I did not include the testing configuration other than mvn test. Afterwards, you can use the standard `actions/upload-artifact` action to upload the html report to github. 
```yml
    tests:
        runs-on: ubuntu-latest
        needs: get-tests
        continue-on-error: true
        strategy:
            matrix:
                tests: ${{ fromJSON(needs.get-tests.outputs.test ) }}
        steps:
            - name: ${{ matrix.test.testName }}
              run: mvn test # at this point I won't explicitly write the testing process
            - name: Upload ${{ matrix.test.htmlTitle }} Artifact
              id: artifact-upload
              if: always()
              uses: actions/upload-artifact@latest
              with:
                name: ${{ matrix.test.htmlTitle }}
                path: ./Report.html
                if-no-files-found: error
                retention-days: 3
                overwrite: true
```
We also wanted to send automated email notifications to the QA team. Since the workflow has a daily schedule it wouldn't send notifications to the QA automatically on it's own so this is the basic foundation of a job that we used to set it up. We used sendgrid which requires a specific SMTP key and sent it with a curl command.
```yml
    email:
        runs-on: ubuntu-latest
        needs: [get-tests, tests]
        continue-on-error: true
        outputs: 
            date: ${{ steps.set-date.outputs.date }}
        steps:
            - name: Get Date
              id: set-date
              if: always()
              shell: pwsh
              run: |
                $date=get-date -f dd-MM-yyyy
                echo "date=$date" >> $env:GITHUB_OUTPUT
            - name: Send Email
              if: always()
              env: ${{ steps.set-date-outputs.date }}
              shell: pwsh
              run: |
                # Here you could use something like sendgrid to send emails to the correct team members with information on the testing that occurred with direct links to the html artifact.
```

:::note[Reflection]
Collaborating across teams to create needed automation can greatly impact work streams and enable good feedback loops especially for those in QA. Another thing is 
:::