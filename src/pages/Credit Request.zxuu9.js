// Velo API Reference: https://www.wix.com/velo/reference/api-overview/introduction
import wixUsers from 'wix-users';
import wixData from 'wix-data';
import { triggeredEmails } from 'wix-crm';

let user; // Declare user outside of the onReady function
let userPoints; // Declare userPoints outside of the onReady function

$w.onReady(function () {
    let auctionStarted = false; // Add this variable
    user = wixUsers.currentUser;

    // Query the most recent accepted submission for the user
    wixData.query("NewDataset")
        .eq("_owner", user.id)
        .eq("approved", true) // Filter for approved submissions
        .descending("_createdDate") // Sort by creation date in descending order
        .limit(1) // Limit to only one result (the most recent one)
        .find()
        .then((results) => {
            if (results.items.length > 0) {
                const mostRecentSubmission = results.items[0];
                // Assuming 'userCredits' is the field storing points (replace with your actual field name)
                userPoints = mostRecentSubmission.userCredits || 0;

                // Display user points on the page
                $w('#points').text = `Your Current Credits: ${userPoints}`;
            } else {
                $w('#points').text = 'No approved points found.';
            }
        })
});

$w.onReady(function () {
    $w('#button1').onClick(() => {
        $w('#userMessage').text = ''; // Clear message after a delay

        // Query the user's data
        wixData.query("Members/PrivateMembersData")
            .eq("_id", wixUsers.currentUser.id)
            .find()
            .then((results) => {
                const memberData = results.items[0]; // Get the member's data
                $w('#inputFirstName').text = memberData.firstName; // Auto-fill first name
                $w('#inputLastName').text = memberData.lastName; // Auto-fill last name
                $w('#Email').text = memberData.loginEmail;
                let userCredit = $w('#input1').value; // Insert data from input1

                    // Save the form data to the CustomCollection
                    wixData.insert("NewDataset", {
                        userCredits: $w('#input1').value, // Insert data from input1
                        firstName: memberData.firstName,
                        lastName: memberData.lastName,
                        emailField: memberData.loginEmail,
                        // Add other fields as needed
                    })
                    .then((insertResult) => {
                        console.log(userCredit);
                        triggeredEmails.emailMember('U8F6ZyF', wixUsers.currentUser.id, {
                            variables: {
                                //userCredits: userCredit,
                                userCredits: userCredit,
                                firstName: memberData.firstName,
                                lastName: memberData.lastName,
                            }
                        });
                        console.log("Form data saved to CustomCollection:", insertResult);
                        // Optionally, you can perform additional actions or provide feedback to the user.
                    })
                    .catch((insertError) => {
                        console.error("Error saving form data to CustomCollection:", insertError);
                        $w('#userMessage').text = 'Error saving form data. Please try again.'; // Display error message
                        // Handle errors or provide feedback to the user.
                    });
                // Inside the success and error callbacks
                $w('#userMessage').text = 'Request for Credit Sent!'; // Display success message
                $w('#input1').value = '';
                setTimeout(() => {
                    $w('#userMessage').text = ''; // Clear message after a delay
                }, 5000); // Adjust the delay (in milliseconds) as needed
            });
    });
});