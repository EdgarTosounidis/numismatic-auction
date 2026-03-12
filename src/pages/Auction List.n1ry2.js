import wixData from 'wix-data';
import wixUsers from 'wix-users';

bidderNumber();

function bidderNumber() {
    const currentUser = wixUsers.currentUser;

    wixData.query("Members/PrivateMembersData")
        .eq("_id", currentUser.id)
        .find()
        .then((results) => {
            const memberData = results.items[0];
            if (!memberData) {
                $w('#currentBidderNum').text = "";
                $w('#signUpTxt').text = "Sign Up";
                $w('#bidderNumber').hide();
            } else {
                $w('#signUpTxt').text = "";
                $w('#signUpTxt').hide();
            }
        })
}