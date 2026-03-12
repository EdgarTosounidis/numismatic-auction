// Velo API Reference: https://www.wix.com/velo/reference/api-overview/introduction
import wixData from 'wix-data';

$w.onReady(function () {
    $w('#button2').onClick(() => {
                // Save the form data to the CustomCollection
                wixData.insert("Member", {
                        userCredits: $w('#input1').value, // Insert data from input1
                        firstName: $w('#inputFirstName').value,
                        lastName: $w('#inputLastName').value,
                        emailField: $w('#Email').value,
                        // Add other fields as needed
                    })
                    .then((insertResult) => {
                        console.log("Form data saved to Member:", insertResult);
                        // Optionally, you can perform additional actions or provide feedback to the user.
                    })
                    .catch((insertError) => {
                        console.error("Error saving form data to Member:", insertError);
                        // Handle errors or provide feedback to the user.
                    });
            });
    });