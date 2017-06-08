[![Build Status](https://travis-ci.org/ditinc/bugzilla-github-extension.svg?branch=master)](https://travis-ci.org/ditinc/bugzilla-github-extension)
# bugzilla-github-extension
This Chrome extension integrates Bugzilla and GitHub to make your life easier.  It is a work in progress, so feel free to contribute!

## Features
#### Bugzilla
- If GitHub Pull Request URL is populated with the pull request's URL, then a link will be added to the bug's title
- There is a button for marking selected bugs as duplicates when changing several bugs at once

###### TODOs:
- Open to suggestions... add an issue!

#### GitHub
- If the repository is associated with a Bugzilla product:
  - The Product will be listed under the repository name
  - There will be buttons to jump to Bugzilla lists of unresolved or resolved bugs
  - There will be buttons to jump to Bugzilla lists of bugs in milestones
  - Ability to choose Bugzilla milestones when adding/editing GitHub milestones
- If the pull request's title includes the bug number (ex: 83513, [83513], Bug 83513, Bug83513):
  - Bug number in title will be a link to the bug
  - Ability to update Bugzilla summary field when editing pull request title
  - Bugzilla section added to side listing some bug details that you can configure
  - Comments will be sent to Bugzilla along with the Hours Worked entered in a new input added next to the comment buttons
    - This includes line comments, though they do not have an Hours Worked field
    - Have the option of setting but to RESOLVED FIXED when making a pull request comment
  - When creating a pull request, you have the option to:
    - Update the GitHub Pull Request URL on the bug in Bugzilla
    - Send the comment to Bugzilla
  - When merging a pull request, you have the option to:
    - Update a Code Status field in Bugzilla to "Merged to master/trunk" or "Merged to parent branch" or something similar based on your configuration
    - Update the bug to RESOLVED TESTED
  - Labels are pushed to the GitHub Labels field on the bug
- If the release's comments include bug numbers (ex: 83513, [83513], Bug 83513, Bug83513):
  - Have the option of setting a Code Status field in Bugzilla to "In Staging" or "In Production" or something similar based on your configuration
  - Have the option of updating a Release field in Bugzilla

###### TODOs:
- Open to suggestions... add an issue!

## Install
#### Chrome Web Store
https://chrome.google.com/webstore/detail/bugzilla-github-extension/ofkjoeocpbkpamfhbfmgglkhhincgbdj

#### Local Install
Here's how you load an extension in Chrome when developing, taken from https://developer.chrome.com/extensions/getstarted#unpacked:
> Extensions that you download from the Chrome Web Store are packaged up as .crx files, which is great for distribution, but not so great for development. Recognizing this, Chrome gives you a quick way of loading up your working directory for testing. Let's do that now.
> 
> 1. Visit chrome://extensions in your browser (or open up the Chrome menu by clicking the icon to the far right of the Omnibox:  The menu's icon is three horizontal bars. and select Extensions under the Tools menu to get to the same place).
> 
> 2. Ensure that the Developer mode checkbox in the top right-hand corner is checked.
> 
> 3. Click Load unpacked extension… to pop up a file-selection dialog.
> 
> 4. Navigate to the directory in which your extension files live, and select it.
> 
> Alternatively, you can drag and drop the directory where your extension files live onto chrome://extensions in your browser to load it.
> 
> If the extension is valid, it'll be loaded up and active right away! If it's invalid, an error message will be displayed at the top of the page. Correct the error, and try again.
