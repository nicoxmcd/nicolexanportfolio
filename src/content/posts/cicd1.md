---
title: CI/CD - Using GitHub Actions Matrix Strategy
published: 2024-06-04
description: "Describing how our team utilized json files to deploy multi environments using GitHub Actions"
image: ""
tags: ["Project", "DevOps", "CI/CD"]
category: DevOps Projects
draft: false
---

## Overview
One of the first projects I had, when we moved from BitBucket to GitHub, was figuring out our CI/CD processes, especially since deployments were taking nearly two hours due to a large amount of different app components. And the fact that the original monolithic repository was not so intuitive when trying to test the latest changes. Because of a matrix strategy you can run multiple builds at the same time (only limited if you were strictly using self-hosted runners). **This enabled us to cut our build time from two hours to 32 minutes when building the fullstack application, (and if just testing a new component then it's as little as 4 minutes).** *Faster iteration allows for faster development!*

## Example Documentation
When looking for inspiration [I scoured the GitHub Actions documentation and found a very simple guide to run matrix strategies](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations):
`example.1`
```yml
jobs:
  example_matrix:
    strategy:
      matrix:
        version: [10, 12, 14]
        os: [ubuntu-latest, windows-latest]
```

From this very simple JSON format, you could run this workflow 3*2 tiimes with each combination. You can also see that you can output a JSON formatted list and ingest in a different job using the fromJSON function:
`example.2`
```yml
jobs:
  define-matrix:
    runs-on: ubuntu-latest

    outputs:
      colors: ${{ steps.colors.outputs.colors }}

    steps:
      - name: Define Colors
        id: colors
        run: |
          echo 'colors=["red", "green", "blue"]' >> "$GITHUB_OUTPUT"

  produce-artifacts:
    runs-on: ubuntu-latest
    needs: define-matrix
    strategy:
      matrix:
        color: ${{ fromJSON(needs.define-matrix.outputs.colors) }}

    steps:
      - name: Define Color
        env:
          color: ${{ matrix.color }}
        run: |
          echo "$color" > color
      - name: Produce Artifact
        uses: actions/upload-artifact@latest
        with:
          name: ${{ matrix.color }}
          path: color
```

## Walkthrough

From those examples, I quickly saw how we might be able to consolidate our workflow to be more readable and to make primary place for editing all of our component artifact information. For example, in the below file, you could name each of the different components, and the information required when building it, such as where to find the build file, and what type of package to build.
`components.json`
```json
[
    {
        "name": "ComponentA",
        "sourcePath": "Components/ComponentA/ComponentA.csproj",
        "outputPath": "Components/Type",
        "zipName": "ComponentA.zip",
        "buildType": "dotnet"
    },
    {
        "name": "ComponentB",
        "sourcePath": "Components/ComponentB/ComponentB.csproj",
        "outputPath": "Components/Type",
        "zipName": "ComponentB.zip",
        "buildType": "python"
    },
    {
        "name": "ComponentC",
        "sourcePath": "Components/ComponentC/ComponentC.csproj",
        "outputPath": "Components/Type",
        "zipName": "ComponentC.zip",
        "buildType": "dotnet"
    }
]
```
Incorporating this into a CI/CD pipeline was a feat in and of itself, but looks quite simple looking back on it. I'll walk through each of the steps as part of the set up.

Workflow dispatches (manually kicking off the workflow) and changes inside component source code would kick off the build process, for this example I listed three components, but there's a lot more than that in reality!
`ci.yml`
```yml
name: CI Workflow
run-name: Building ${{ github.ref_name }} ${{ github.run_number }}
on:
    workflow_dispatch:
    push:
        paths:
            - "Components/ComponentA/**"
            - "Components/ComponentB/**"
            - "Components/ComponentC/**"
```
This step gets the list of changed files depending on the event that triggered the workflow. The overall events that trigger this step is either a PR or a push. If the event was caused by a pull request, only the files that are being requested for review would be included in the list. If the event was triggered by a push, then it would get the git diff between the last commit and the current commit. Both comparisons would output the same list as a `GITHUB_OUTPUT` to be used in a future step.

```yml
jobs:
    get-changed-files:
        runs-on: ubuntu-latest
        outputs:
            file-list: ${{ steps.changed-files.outputs.list }}
            components: ${{ steps.json-format.outputs.components }}
        steps:
            - uses: actions/checkout@latest
              with:
                fetch-depth: ${{ github.event_name == 'pull_request' && 2 || 0 }}
            - name: Get Raw Changed File List
              id: changed-files
              if: ${{ (github.event_name == 'pull_request') || (github.event_name == 'push') }}
              runs: |
                # If it's a pull request, the whole stack should be built, if it was anything else, then just the components that had changed files
                if ${{ github.event_name == 'pull_request' }}; then
                    echo "list=$(git diff --name-only -r HEAD^1 HEAD | xargs)" >> $GITHUB_OUTPUT
                else
                    echo "list=$(git diff --name-only ${{ github.event.before }} ${{ github.event.after }} | xargs)" >> $GITHUB_OUTPUT
                fi
```
Here, we would either ingest the changed file list from the previous step OR if it was a workflow dispatch or a newly created branch, then it would ingest the `components.json` file as the fullstack list to be built. If it were any other trigger, then we would create an empty list and cycle through the changed list from the previous step. From here, I used some bash string augmentation to get the file name `ComponentA` isolated (*since some of the paths were inconsistent with naming conventions*) and then compared it with the `components.json` to make sure it was indeed one of the components on the list. We then appended the dictionary list of the component's information onto the new empty list, and we repeat that for each of the changed files. At the end we remove extra characters and make sure it's a complete json file to be saved as a `GITHUB_OUTPUT`.
```yml
            - name: Formatting Changed File List
              id: json-format
              shell: bash
              run: | 
                # Ingest whole components.json if deployed with a workflow dispatch or when a new branch is created
                if [ "${{ github.event_name }}" == "workflow_dispatch" ] || [ "${{ github.event_name }}" == "create" ]; then
                    echo "components=`jq '.' -c components.json`" >> $GITHUB_OUTPUT
                else
                    new-list=""
                    # Editing the path of the changed file to get the component name
                    for file in ${{ steps.changed-files.outputs.list }}; do
                        file=${path#*/}
                        path=${path#*/}
                        path=${path%%/*}
                        # Compare the component name to the component.json file to make sure it's one of the app components
                        jq-outputs=`jq -c "map(select(.name==\"${path}\")) | first" components.json`
                        if [["${jq-outputs}" != "null" ]]; then
                            final-list="${new-list}${jq-outputs},"
                        else
                            echo "${path} is not a component."
                            continue
                        fi
                        continue
                    done
                changed-list="${final-list:1}"
                changed-list="[${changed-list::-1}]"
                changed-list=`echo ${changed-list} | jq -c 'unique_by(.name)'`
                echo "components=${changed-list}" >> $GITHUB_OUTPUT
                fi 
```
Using the previous example, if we only changed ComponentA and ComponentC then the outputs.components would be:
`components.json`
```yml
[
    {
        "name": "ComponentA",
        "sourcePath": "Components/ComponentA/ComponentA.csproj",
        "outputPath": "Components/Type",
        "zipName": "ComponentA.zip",
        "buildType": "dotnet"
    },
    {
        "name": "ComponentC",
        "sourcePath": "Components/ComponentC/ComponentC.csproj",
        "outputPath": "Components/Type",
        "zipName": "ComponentC.zip",
        "buildType": "dotnet"
    }
]
```


In a new job, we can use our job output as the matrix strategy to build. We would also be able to save each of the component's dictionary lists as it's own environment variable. This job would run per component, so if you were to change files in 10 component paths then this build job would run 10 times!
```yml
    build:
        runs-on: ubuntu-latest
        needs: get-changed-files
        continue-on-error: true
        strategy:
            matrix:
                components: ${{ fromJSON(needs.get-changed-files.outputs.components ) }}
                fail-fast: false
        env:
            name: ${{ matrix.components.name }}
            sourcePath: ${{ matrix.components.sourcePath }}
            outputPath: ${{ matrix.components.outputPath }}
            zipName: ${{ matrix.components.zipName }}
            buildType: ${{ matrix.components.buildType }}
        steps:
            - uses: actions/checkout@latest
        
```
At the end of my example, you could have conditionals for specific package build steps (i.e. step.python-build would only run if env.buildType == python) and other necessary steps to ensure that each component is built properly. In this case, we also uploaded each component to Artifactory, where our QA team or other devs can share and access these artifacts for testing or promotion.


                               
:::note[Reflection]
There are a ton of things you can do with any specific tool, but sometimes that means going through the documentation and sitting on it to come up with some ideas. We also used this process in our SaaS product to implement phased deployments for components that depend on eachother. I also worked on this project with the OG Bernie Crandall (who worked on the phased deployment logic)!
:::