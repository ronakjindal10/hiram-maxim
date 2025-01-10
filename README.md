# Bulk Operations Helper

This extension is designed to help with bulk operations on the CRM platforms. It intercepts network requests to capture location IDs and authentication headers, and stores them for later use. Currently, we plan on helping people enable or disable features for multiple locations at once.

Todo:
- Trigger the location component on our own or make it obvious to the user where they need to click
- Follow up action after first few locations are captured
    - ~Confirm that we captured a few locations to start with~
    - ~Ask them to go on to enable or disable the feature that they want to do the bulk operation on~
        - How to understand which network call is for the feature? The user will have multiple network calls from their initial page to the feature page
        - Consider asking the user to tell us when we need to learn the behaviour. Don't monitor network calls until the user has reached the network page, clicks on "Learn this" and then clicks on the feature they want to enable or disable
    - Confirm that we learnt their behaviour and ask for confirmation to do it for all the locations we have captured
    - Show them progress/errors
        - Handle cases where the feature does not apply to the location
        - Handle errors gracefully
    - Results
- Get all the locations