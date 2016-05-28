# DIT-Bugzilla-GitHub
This Chrome extension integrates Bugzilla and GitHub to make your life easier.  It is a work in progress, so feel free to contribute!

## Features
#### Bugzilla
- If GitHub Pull Request URL is populated with the pull request's URL, then a link will be added to the bug's title

###### TODOs:
- Open to suggestions... add an issue!

#### GitHub
- If the repository is associated with a Bugzilla product:
  - The Product will be listed under the repository name
  - There will be buttons to jump to Bugzilla lists of unresolved or resolved bugs
- If the pull request's title includes the bug number (ex: 83513, [83513], Bug 83513, Bug83513):
  - Bug number in title will be a link to the bug
  - Bugzilla section added to side listing some bug details
  - Comments will be sent to Bugzilla along with the Hours Worked entered in a new input added next to the comment buttons
    - This includes line comments, though they do not have an Hours Worked field
    - Have the option of setting but to RESOLVED FIXED when making a pull request comment
  - When creating a pull request, you have the option to:
    - Update the GitHub Pull Request URL on the bug in Bugzilla
    - Send the comment to Bugzilla
  - When merging a pull request, you have the option to:
    - Update the Code Status in Bugzilla to "Merged to master/trunk" or "Merged to parent branch"
    - Update the bug to RESOLVED TESTED
  - Labels are pushed to the GitHub Labels field on the bug

###### TODOs:
- Open to suggestions... add an issue!

## Install
Here's how you load an extension in Chrome, taken from https://developer.chrome.com/extensions/getstarted#unpacked:
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
