import wixData from 'wix-data';
import { local } from 'wix-storage';
import { triggeredEmails } from 'wix-crm';

let count = 0;
let storedStatuses = JSON.parse(local.getItem('storedStatuses')) || {};

$w.onReady(function () {
    fetchAndCompareStatuses();
    $w("#sendEmailsButton").onClick(() => {
        console.log("Button Pressed");
        count++; // Increment the count when button is pressed
        fetchAndCompareStatuses();
    });
});

function fetchAndCompareStatuses() {
    wixData.query('NewDataset')
        .find()
        .then(results => {
            let usersAndStatuses = []; // Prepare an array to hold user-status pairs

            results.items.forEach(item => {
                const { _id, approved, denied, _owner, userCredits } = item;
                // Determining status based on boolean fields 'approved' and 'denied'
                let currentStatus = 'Pending'; // Default status
                if (approved === true) currentStatus = 'approved'; // If approved is true
                if (denied === true) currentStatus = 'denied'; // If denied is true

                usersAndStatuses.push({ userID: _owner, _id, status: currentStatus }); // Add to array

                // Check if status has changed and update stored status
                if (storedStatuses[_id] && storedStatuses[_id] !== currentStatus) {
                    console.log(`Status changed for ID ${_id}. New Status: ${currentStatus}. User Id: ${_owner}. User Credits: ${userCredits}`);
                    if (!currentStatus) {
                        triggeredEmails.emailMember('U8Qiptx', _owner, {
                            variables: {
                                userCredits: userCredits
                            }
                        });
                    }
                    if (currentStatus) {
                        triggeredEmails.emailMember('U8Qgv2g', _owner, {
                            variables: {
                                userCredits: userCredits
                            }
                        });
                    }
                } else if (!storedStatuses[_id]) {
                    console.log(`New record found for ID ${_id}. Status: ${currentStatus}`);
                }
                storedStatuses[_id] = currentStatus;
            });

            // Log all users and their statuses
            if (usersAndStatuses.length > 0) {
                console.log("All users and their statuses:");
                usersAndStatuses.forEach(userStatus => {
                    console.log(`User ID: ${userStatus.userID}, Status: ${userStatus.status}`);
                });
            }

            // Update local storage with the latest statuses
            local.setItem('storedStatuses', JSON.stringify(storedStatuses));

            // If count is 1, fetch again
            if (count === 1) {
                count = 0; // Reset count
                fetchAndCompareStatuses(); // Fetch again
            }
        })
        .catch(err => {
            console.error(err);
        });
}